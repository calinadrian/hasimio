import type {Stream} from './media';

// Sources found for an episode, kept for a while on the TV. The next episode
// is looked up near the end of the current one, so Up next can start it
// without searching every source again; reopening a title is instant too.
const TTL=20*60*1000,LIMIT=12;
const entries=new Map<string,{streams:Stream[];at:number}>();

export function streamCacheKey(type:string,id:string,sources:readonly {url:string}[]){
  return JSON.stringify([type,id,sources.map(source=>source.url).sort()]);
}
export function cachedStreams(key:string,now=Date.now()):Stream[]|undefined{
  const hit=entries.get(key);
  if(!hit)return undefined;
  if(now-hit.at>TTL){entries.delete(key);return undefined;}
  return hit.streams;
}
/** Only complete, non-empty answers are kept; a failed search is retried next time. */
export function storeStreams(key:string,streams:Stream[],now=Date.now()){
  if(!streams.length)return;
  entries.delete(key);entries.set(key,{streams,at:now});
  while(entries.size>LIMIT)entries.delete(entries.keys().next().value!);
}
/** Retry asks every source again. */
export function forgetStreams(){entries.clear();}
