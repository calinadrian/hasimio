import {getJson,resourceUrl,type Addon,type Stream} from './media';

export const SOURCE_TIMEOUT_MS=20000;
export type StreamSearchState={streams:Stream[];pending:number;failed:string[]};
// Publish each provider independently; preserve extension order regardless of response order.
export async function searchStreams(sources:Addon[],type:string,id:string,signal:AbortSignal,onUpdate:(state:StreamSearchState)=>void){
  const results:Stream[][]=sources.map(()=>[]),failed:string[]=[];
  let pending=sources.length;
  const publish=()=>{if(!signal.aborted)onUpdate({streams:results.flat(),pending,failed:[...failed]});};
  publish();
  await Promise.all(sources.map(async(source,index)=>{
    try{
      const payload=await getJson<{streams:Stream[]}>(resourceUrl(source.url,'stream',type,id),signal,SOURCE_TIMEOUT_MS);
      if(!Array.isArray(payload.streams))throw new Error('Invalid stream response.');
      results[index]=payload.streams;
    }catch{failed.push(source.manifest.name);}
    finally{pending--;publish();}
  }));
}
