import {validHash,sizeLabel} from './piratebay.mjs';
import {detectQuality,detectCodec} from '../shared/stream-info.mjs';

export const eztvManifest={id:'org.hasimio.eztv',name:'EZTV',version:'1.0.0',
  description:'Alternative series episode torrent sources from EZTV. Streams through Hasimio’s local torrent service.',
  resources:['stream'],types:['series'],idPrefixes:['tt'],catalogs:[]};
export const EZTV_API='https://eztvx.to/api/get-torrents';
const imdbNumber=value=>String(value??'').replace(/^tt/,'').replace(/^0+/,'');
const count=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
function episodeId(type,id){
  const match=typeof id==='string'&&/^(tt\d+):(\d+):(\d+)$/.exec(id);
  if(type!=='series'||!match||!Number.isSafeInteger(Number(match[2]))||!Number.isSafeInteger(Number(match[3])))throw new Error('EZTV needs a specific IMDb series episode.');
  return {imdb:match[1],season:Number(match[2]),episode:Number(match[3])};
}
export function eztvResults(rows,video){
  if(!Array.isArray(rows))throw new Error('EZTV returned an invalid response.');
  const streams=rows.filter(row=>row&&validHash(row.hash)&&imdbNumber(row.imdb_id)===imdbNumber(video.imdb)&&
    /^\d+$/.test(String(row.season))&&/^\d+$/.test(String(row.episode))&&Number(row.season)===video.season&&Number(row.episode)===video.episode&&
    typeof row.title==='string'&&!/\.(exe|msi|apk|zip|rar|iso)(\s|$)/i.test(row.filename??row.title))
    .map(row=>{const quality=detectQuality(row.title),codec=detectCodec(row.title),seeders=count(row.seeds),sizeBytes=count(row.size_bytes);
      return {infoHash:row.hash.toLowerCase(),provider:'EZTV',name:`EZTV · ${quality==='Other'?'Torrent':quality}`,quality,codec,seeders,sizeBytes,
        filename:typeof row.filename==='string'?row.filename:row.title,
        title:`${row.title}\n${seeders} seeders · ${sizeLabel(sizeBytes)}${codec==='HEVC'?' · HEVC (browser support varies)':''}`};});
  const seen=new Set();
  return streams.sort((a,b)=>b.seeders-a.seeders).filter(stream=>{if(seen.has(stream.infoHash))return false;seen.add(stream.infoHash);return true;}).slice(0,40);
}
// EZTV filters by show, not episode. Read every page before matching so older seasons work too.
// Cache a show's results across episode switches; no torrent/download URL from the API is fetched.
export function createEztvSearch({fetchImpl=fetch,now=Date.now}={}){
  const shows=new Map();
  async function load(imdb){
    const signal=AbortSignal.timeout(25000);
    async function page(number){
      const url=new URL(EZTV_API);url.searchParams.set('imdb_id',imdbNumber(imdb));url.searchParams.set('limit','100');url.searchParams.set('page',String(number));
      const response=await fetchImpl(url,{signal,redirect:'error',credentials:'omit'});
      if(!response.ok)throw new Error(`EZTV returned HTTP ${response.status}.`);
      const data=await response.json();
      if(!data||!Number.isSafeInteger(data.torrents_count)||data.torrents_count<0||
        !(Array.isArray(data.torrents)||(data.torrents===undefined&&data.torrents_count===0))||(data.torrents?.length??0)>100||
        Number(data.page)!==number||Number(data.limit)!==100)throw new Error('EZTV returned an invalid response.');
      return {...data,torrents:data.torrents??[]};
    }
    const first=await page(1),pages=Math.ceil(first.torrents_count/100);
    if(pages>100)throw new Error('This EZTV show has too many releases to search completely. Try another source.');
    const results=[first.torrents];let next=2;
    await Promise.all(Array.from({length:Math.min(3,Math.max(0,pages-1))},async()=>{while(next<=pages){const current=next++;results[current-1]=(await page(current)).torrents;}}));
    return results.flat();
  }
  return async function searchEztv(type,id){
    const video=episodeId(type,id),key=imdbNumber(video.imdb);let entry=shows.get(key);
    if(!entry||entry.expires<=now()){
      for(const [old,item] of shows)if(item.expires<=now())shows.delete(old);
      if(shows.size>=50)shows.delete(shows.keys().next().value);
      entry={expires:now()+5*60*1000,promise:load(video.imdb)};shows.set(key,entry);
      const current=entry;entry.promise.catch(()=>{if(shows.get(key)===current)shows.delete(key);});
    }
    return {streams:eztvResults(await entry.promise,video)};
  };
}
