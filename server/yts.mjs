import {validHash,sizeLabel} from './piratebay.mjs';
import {detectQuality,detectCodec} from '../shared/stream-info.mjs';

export const ytsManifest={
  id:'org.hasimio.yts',name:'YTS',version:'1.0.0',
  description:'Alternative movie torrent sources from YTS. Streams through Hasimio’s local torrent service.',
  resources:['stream'],types:['movie'],idPrefixes:['tt'],catalogs:[],
};
// YTS's documented API origin. Never follow torrent/download URLs supplied by results.
export const YTS_API='https://movies-api.accel.li/api/v2/list_movies.json';
const count=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
export function ytsResults(payload,imdb){
  if(payload?.status!=='ok'||!payload.data||!Number.isInteger(payload.data.movie_count)||payload.data.movie_count<0||
    (payload.data.movies!==undefined&&!Array.isArray(payload.data.movies))||
    (payload.data.movie_count>0&&!Array.isArray(payload.data.movies)))throw new Error('YTS returned an invalid response.');
  const streams=[];
  for(const movie of payload.data.movies??[]){
    if(movie?.imdb_code!==imdb||typeof movie.title!=='string'||!Array.isArray(movie.torrents))continue;
    for(const torrent of movie.torrents){
      if(!torrent||!validHash(torrent.hash))continue;
      const label=[movie.title,Number.isInteger(movie.year)?movie.year:undefined,
        typeof torrent.quality==='string'?torrent.quality:undefined,
        typeof torrent.type==='string'?torrent.type:undefined,
        typeof torrent.video_codec==='string'?torrent.video_codec:undefined,'YTS'].filter(Boolean).join(' ');
      const quality=detectQuality(label),codec=detectCodec(label),seeders=count(torrent.seeds),sizeBytes=count(torrent.size_bytes);
      streams.push({infoHash:torrent.hash.toLowerCase(),provider:'YTS',name:`YTS · ${quality==='Other'?'Torrent':quality}`,
        quality,codec,seeders,sizeBytes,filename:label,
        title:`${label}\n${seeders} seeders · ${sizeLabel(sizeBytes)}${codec==='HEVC'?' · HEVC (browser support varies)':''}`});
    }
  }
  const seen=new Set();
  return streams.sort((a,b)=>b.seeders-a.seeders).filter(stream=>{
    if(seen.has(stream.infoHash))return false;
    seen.add(stream.infoHash);return true;
  }).slice(0,40);
}
export async function searchYts(type,id,fetchImpl=fetch){
  if(type!=='movie'||!/^tt\d+$/.test(id))throw new Error('YTS supports IMDb movies only.');
  const url=new URL(YTS_API);url.searchParams.set('query_term',id);url.searchParams.set('limit','50');
  const response=await fetchImpl(url,{signal:AbortSignal.timeout(20000),redirect:'error',credentials:'omit'});
  if(!response.ok)throw new Error(`YTS returned HTTP ${response.status}.`);
  return {streams:ytsResults(await response.json(),id)};
}
