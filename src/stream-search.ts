import {getJson,resourceUrl,type Addon,type Stream} from './media';
import {debridHeaders} from './debrid';

export const SOURCE_TIMEOUT_MS=20000;
export type StreamSearchState={streams:Stream[];pending:number;failed:string[]};

/** One row per torrent file: the same release found by several sources (Torrentio and The Pirate Bay both list
 *  most popular torrents) is merged. The kept record is the first that names its file, with the highest seeder
 *  count seen; the other sources' names go to `alsoFrom`. Different files of one torrent (season packs) and
 *  direct links stay separate. */
export function mergeDuplicateStreams(streams:Stream[],sourceNames:string[]=[]):Stream[]{
  const merged:Stream[]=[],names:(string|undefined)[]=[],byHash=new Map<string,number[]>();
  streams.forEach((stream,index)=>{
    const hash=stream.infoHash?.toLowerCase(),name=stream.provider||sourceNames[index];
    if(!hash){merged.push(stream);names.push(name);return;}
    const slots=byHash.get(hash)??[];
    const at=slots.find(slot=>{const kept=merged[slot];return kept.fileIdx===undefined||stream.fileIdx===undefined||kept.fileIdx===stream.fileIdx;});
    if(at===undefined){byHash.set(hash,[...slots,merged.length]);merged.push(stream);names.push(name);return;}
    const kept=merged[at],swap=kept.fileIdx===undefined&&stream.fileIdx!==undefined;
    const keep=swap?stream:kept,other=swap?kept:stream,keepName=swap?name:names[at],otherName=swap?names[at]:name;
    const seeders=Math.max(kept.seeders??-1,stream.seeders??-1),sizeBytes=keep.sizeBytes??other.sizeBytes;
    const alsoFrom=[...new Set([...(kept.alsoFrom??[]),...(stream.alsoFrom??[]),...(otherName?[otherName]:[])])].filter(item=>item!==keepName);
    merged[at]={...keep,...(seeders>=0?{seeders}:{}),...(sizeBytes!==undefined?{sizeBytes}:{}),...(alsoFrom.length?{alsoFrom}:{})};
    names[at]=keepName;
  });
  return merged;
}

// Publish each provider independently; preserve extension order regardless of response order.
export async function searchStreams(sources:Addon[],type:string,id:string,signal:AbortSignal,onUpdate:(state:StreamSearchState)=>void){
  const results:Stream[][]=sources.map(()=>[]),failed:string[]=[];
  let pending=sources.length;
  const publish=()=>{if(signal.aborted)return;const names=results.flatMap((list,index)=>list.map(()=>sources[index].manifest.name));onUpdate({streams:mergeDuplicateStreams(results.flat(),names),pending,failed:[...failed]});};
  publish();
  await Promise.all(sources.map(async(source,index)=>{
    try{
      const payload=await getJson<{streams:Stream[]}>(resourceUrl(source.url,'stream',type,id),signal,SOURCE_TIMEOUT_MS,debridHeaders(source.url));
      if(!Array.isArray(payload.streams))throw new Error('Invalid stream response.');
      results[index]=payload.streams;
    }catch{failed.push(source.manifest.name);}
    finally{pending--;publish();}
  }));
}
