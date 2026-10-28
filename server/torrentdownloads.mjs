import {parseVideoId,validHash,sizeLabel} from './piratebay.mjs';
import {detectQuality,detectCodec} from '../shared/stream-info.mjs';

export const torrentDownloadsManifest={id:'org.hasimio.torrentdownloads',name:'TorrentDownloads',version:'1.0.0',
  description:'Alternative movie and series episode torrent sources from TorrentDownloads. Streams through Hasimio’s local torrent service.',
  resources:['stream'],types:['movie','series'],idPrefixes:['tt'],catalogs:[]};
export const TORRENTDOWNLOADS_ORIGIN='https://www.torrentdownloads.pro';
const entities={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
const decode=text=>String(text??'').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(all,entity)=>{
  if(entity[0]!=='#')return entities[entity.toLowerCase()]??all;
  const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
  return code>0&&code<=0x10ffff?String.fromCodePoint(code):all;
});
const plain=text=>decode(text.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const attribute=(tag,name)=>decode(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,'i').exec(tag)?.[2]);
const normalize=name=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const unsafe=name=>/(?:^|[.\s_\-])(exe|msi|apk|bat|cmd|scr|zip|rar|7z|iso)(?=$|[.\s_\-\[\]()])/i.test(name);
export function matchesTorrentTitle(name,meta,video){
  if(unsafe(name))return false;
  if(video.season!=null){
    const episode=/^(.*?)\bS(\d{1,3})E(\d{1,4})(?!\d|[ ._-]*E\d)/i.exec(name);
    if(!episode||Number(episode[2])!==video.season||Number(episode[3])!==video.episode)return false;
    const prefix=normalize(episode[1]),title=normalize(meta.name);
    return prefix===title||(meta.start&&prefix===title+meta.start);
  }
  const movie=/^(.*?)[ ._\[(]+((?:19|20)\d{2})(?!\d)/.exec(name);
  return !!(movie&&meta.start&&Number(movie[2])===meta.start&&normalize(movie[1])===normalize(meta.name));
}
export function torrentDownloadRows(html){
  const rows=[];
  for(const match of html.matchAll(/<div\b[^>]*class=["'][^"']*\bgrey_bar3\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)){
    const block=match[1],link=[...block.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].find(m=>/^\/torrent\/\d+\//.test(attribute(m[1],'href')));
    if(!link)continue;
    const href=attribute(link[1],'href');let url;try{url=new URL(href,TORRENTDOWNLOADS_ORIGIN);}catch{continue;}
    if(url.origin!==TORRENTDOWNLOADS_ORIGIN||!/^\/torrent\/\d+\//.test(url.pathname)||url.username||url.password)continue;
    url.hash='';
    const name=attribute(link[1],'title').replace(/^View torrent info\s*:\s*/i,'')||plain(link[2]);
    const fields=[...block.matchAll(/<span\s*>([\s\S]*?)<\/span>/gi)].map(m=>plain(m[1]));
    const size=fields[2]?.match(/([\d.]+)\s*(KB|MB|GB|TB)/i),units={KB:1,MB:2,GB:3,TB:4};
    const seeders=Number(fields[1]?.replaceAll(',',''));
    rows.push({url:url.href,name,seeders:Number.isFinite(seeders)?Math.max(0,seeders):0,sizeBytes:size?Number(size[1])*1024**units[size[2].toUpperCase()]:0});
  }
  return [...new Map(rows.map(row=>[row.url,row])).values()];
}
export function torrentDownloadStream(html,row,imdb){
  const linkedImdb=[...html.matchAll(/imdb\.com\/title\/(tt\d+)/gi)].map(m=>m[1]);
  if(linkedImdb.length&&!linkedImdb.includes(imdb))return undefined;
  const hash=/magnet:\?xt=urn:btih:([a-f\d]{40})(?=[&"'\s<])/i.exec(decode(html))?.[1];
  if(!validHash(hash)||unsafe(row.name))return undefined;
  const quality=detectQuality(row.name),codec=detectCodec(row.name);
  return {infoHash:hash.toLowerCase(),provider:'TorrentDownloads',name:`TorrentDownloads · ${quality==='Other'?'Torrent':quality}`,
    quality,codec,seeders:row.seeders,sizeBytes:row.sizeBytes,filename:row.name,
    title:`${row.name}\n${row.seeders} seeders · ${sizeLabel(row.sizeBytes)}${codec==='HEVC'?' · HEVC (browser support varies)':''}`};
}
export async function searchTorrentDownloads(type,id,fetchImpl=fetch,lookupTitle){
  if(!['movie','series'].includes(type)||!/^tt\d+(?::\d+:\d+)?$/.test(id))throw new Error('TorrentDownloads supports IMDb movies and specific series episodes.');
  const video=parseVideoId(type,id);
  if(!video.imdb||(type==='movie'&&video.season!=null))throw new Error('Choose an IMDb movie or specific series episode.');
  const meta=await lookupTitle?.(video.imdb);
  if(!meta?.name)throw new Error('Could not resolve the title for TorrentDownloads search.');
  const suffix=type==='series'?`S${String(video.season).padStart(2,'0')}E${String(video.episode).padStart(2,'0')}`:meta.start;
  const url=new URL('/search/',TORRENTDOWNLOADS_ORIGIN);url.searchParams.set('search',`${meta.name.replace(/['’]/g,'').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim()} ${suffix??''}`.trim());
  const signal=AbortSignal.timeout(25000);
  async function page(url){
    if(new URL(url).origin!==TORRENTDOWNLOADS_ORIGIN)throw new Error('Invalid TorrentDownloads page.');
    const response=await fetchImpl(url,{signal,redirect:'error',credentials:'omit'});
    if(!response.ok)throw new Error(`TorrentDownloads returned HTTP ${response.status}.`);
    const html=await response.text();
    if(html.length>4*1024*1024)throw new Error('TorrentDownloads returned an oversized page.');
    if(/<title[^>]*>\s*(?:Just a moment|Attention Required)/i.test(html)||/window\._cf_chl_opt\s*=/.test(html))throw new Error('TorrentDownloads requires browser verification. Other sources remain available.');
    return html;
  }
  const html=await page(url);
  if(!/Torrent Downloads|TorrentDownloads/i.test(html))throw new Error('TorrentDownloads returned an unrecognised page.');
  const candidates=torrentDownloadRows(html).filter(row=>matchesTorrentTitle(row.name,meta,video)).sort((a,b)=>b.seeders-a.seeders).slice(0,16);
  const streams=[];let next=0,failures=0;
  await Promise.all(Array.from({length:Math.min(3,candidates.length)},async()=>{while(next<candidates.length){const row=candidates[next++];try{const stream=torrentDownloadStream(await page(row.url),row,video.imdb);if(stream)streams.push(stream);}catch{failures++;}}}));
  if(candidates.length&&failures===candidates.length)throw new Error('TorrentDownloads search worked, but its torrent details could not load. Retry later.');
  const seen=new Set();
  return {streams:streams.sort((a,b)=>b.seeders-a.seeders).filter(s=>{if(seen.has(s.infoHash))return false;seen.add(s.infoHash);return true;})};
}
