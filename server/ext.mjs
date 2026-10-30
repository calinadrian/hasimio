import {createHash} from 'node:crypto';
import {parseVideoId,sizeLabel,validHash} from './piratebay.mjs';
import {matchesTorrentTitle} from './torrentdownloads.mjs';
import {detectQuality,detectCodec} from '../shared/stream-info.mjs';

export const extManifest={id:'org.hasimio.ext',name:'EXT',version:'1.0.0',description:'Movie and series torrents from ext.to. Availability depends on EXT’s browser verification.',resources:['stream'],types:['movie','series'],idPrefixes:['tt'],catalogs:[]};
const origin='https://ext.to';
const decode=value=>String(value??'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(?:0*39|x27);/gi,"'").replace(/&nbsp;/gi,' ');
const plain=value=>decode(value.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const attr=(tag,name)=>decode(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,'i').exec(tag)?.[2]);
export function extRows(html){
  const table=/<table\b[^>]*class=["'][^"']*\bsearch-table\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1]??'';
  const rows=[];
  for(const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
    const link=[...(cells[0]??'').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].find(m=>/\btorrent-title-link\b/.test(attr(m[1],'class')));
    if(!link)continue;
    let url;try{url=new URL(attr(link[1],'href'),origin);}catch{continue;}
    if(url.origin!==origin||url.username||url.password||!/^\/[a-z\d][a-z\d-]*-\d+\/?$/i.test(url.pathname))continue;
    const size=plain(cells[1]??'').match(/([\d.,]+)\s*([KMGT])i?B/i);
    rows.push({url:url.href,id:/-(\d+)\/?$/.exec(url.pathname)[1],name:plain(link[2]),sizeBytes:size?Number(size[1].replaceAll(',',''))*1024**({K:1,M:2,G:3,T:4}[size[2].toUpperCase()]):0,seeders:Number(plain(cells[4]??'').replace(/[^\d]/g,''))||0});
  }
  return [...new Map(rows.map(row=>[row.url,row])).values()];
}
export function extStream(magnet,row,imdb,html=''){
  const linked=[...html.matchAll(/imdb\.com\/title\/(tt\d+)/gi)].map(m=>m[1]);
  if(linked.length&&!linked.includes(imdb))return;
  const hash=/magnet:\?xt=urn:btih:([a-f\d]{40})(?=[&"'\s<]|$)/i.exec(decode(magnet))?.[1];
  if(!validHash(hash))return;
  const quality=detectQuality(row.name),codec=detectCodec(row.name);
  return {infoHash:hash.toLowerCase(),provider:'EXT',name:`EXT · ${quality==='Other'?'Torrent':quality}`,quality,codec,seeders:row.seeders,sizeBytes:row.sizeBytes,filename:row.name,title:`${row.name}\n${row.seeders} seeders · ${sizeLabel(row.sizeBytes)}`};
}
export async function searchExt(type,id,fetchImpl=fetch,lookupTitle){
  const video=parseVideoId(type,id);
  if(!video.imdb)throw new Error('EXT supports IMDb movies and specific series episodes.');
  const meta=await lookupTitle?.(video.imdb);
  if(!meta?.name)throw new Error('Could not resolve the title for EXT search.');
  const signal=AbortSignal.timeout(18000),cookies=new Map();
  async function request(url,options={}){
    const target=new URL(url);
    if(target.origin!==origin||target.username||target.password)throw new Error('Invalid EXT page.');
    const response=await fetchImpl(target.href,{signal,redirect:'error',credentials:'omit',...options,headers:{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers}});
    if(!response.ok)throw new Error(response.status===403?'EXT requires browser verification. Other sources remain available.':`EXT returned HTTP ${response.status}.`);
    for(const cookie of response.headers?.getSetCookie?.()??[]){const pair=cookie.split(';')[0],index=pair.indexOf('=');if(index>0)cookies.set(pair.slice(0,index),pair.slice(index+1));}
    const text=await response.text();
    if(text.length>4*1024*1024)throw new Error('EXT returned an oversized page.');
    if(/window\._cf_chl_opt\s*=|<title[^>]*>\s*(?:Just a moment|Attention Required)/i.test(text))throw new Error('EXT requires browser verification. Other sources remain available.');
    return text;
  }
  const suffix=type==='series'?`S${String(video.season).padStart(2,'0')}E${String(video.episode).padStart(2,'0')}`:meta.start??'';
  const url=new URL('/browse/',origin);url.search=new URLSearchParams({q:`${meta.name} ${suffix}`.trim(),cat:type==='movie'?'1':'2',sort:'seeds',order:'desc'}).toString();
  const html=await request(url);
  if(!/search-table|EXT Torrents/i.test(html))throw new Error('EXT returned an unrecognised search page.');
  const candidates=extRows(html).filter(row=>matchesTorrentTitle(row.name,meta,video)).sort((a,b)=>b.seeders-a.seeders).slice(0,12);
  const streams=[];let next=0,failures=0;
  await Promise.all(Array.from({length:Math.min(2,candidates.length)},async()=>{while(next<candidates.length){const row=candidates[next++];try{
    const detail=await request(row.url);
    let stream=extStream(detail,row,video.imdb,detail);
    if(!stream){
      const token=/window\.pageToken\s*=\s*["']([^"']+)["']/.exec(detail)?.[1];
      const csrf=/window\.csrfToken\s*=\s*["']([^"']+)["']/.exec(detail)?.[1]??[...detail.matchAll(/<meta\b([^>]*)>/gi)].filter(m=>attr(m[1],'name')==='csrf-token').map(m=>attr(m[1],'content'))[0];
      if(!token||!csrf)throw new Error('EXT magnet details are unavailable.');
      const timestamp=String(Math.floor(Date.now()/1000)),hmac=createHash('sha256').update(`${row.id}|${timestamp}|${token}`).digest('hex');
      const body=new URLSearchParams({torrent_id:row.id,action:'get_magnet',download_type:'magnet',timestamp,hmac,sessid:csrf});
      const result=JSON.parse(await request(`${origin}/ajax/getTorrentMagnet.php`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest',Referer:row.url,Origin:origin},body}));
      stream=extStream(result.url??result.magnet??'',row,video.imdb,detail);
    }
    if(stream)streams.push(stream);else failures++;
  }catch{failures++;}}}));
  if(candidates.length&&failures===candidates.length)throw new Error('EXT results loaded, but magnet details are unavailable. Other sources remain available.');
  return {streams:[...new Map(streams.sort((a,b)=>b.seeders-a.seeders).map(stream=>[stream.infoHash,stream])).values()]};
}
