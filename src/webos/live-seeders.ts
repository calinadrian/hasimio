import {useEffect,useMemo,useRef,useState} from 'react';
import type {Stream} from '../media';
import {engineUrl} from '../engine';

// Indexes report stale seeder counts (a source listed with 617 seeders had 1
// live seeder). The TV service asks the trackers for live counts so Play ranks
// sources by swarms that can actually deliver.

/** Live counts replace listed ones; fewer than 2 live seeders counts as dead. */
export function withLiveSeeders(streams:Stream[],counts:Record<string,number>):Stream[]{
  return streams.map(stream=>{
    const live=stream.infoHash?counts[stream.infoHash.toLowerCase()]:undefined;
    return live===undefined?stream:{...stream,seeders:live<2?0:live};
  });
}

// Counts already asked for, including the next episode's sources looked up
// before it starts, so its Play does not wait for the trackers again.
const KNOWN_TTL=10*60*1000;
const known=new Map<string,{count:number;at:number}>();
function remembered(hash:string,now=Date.now()){const hit=known.get(hash);return hit&&now-hit.at<KNOWN_TTL?hit.count:undefined;}
const hashesOf=(streams:Stream[])=>Array.from(new Set(streams.flatMap(stream=>stream.infoHash?[stream.infoHash.toLowerCase()]:[])));

async function askSwarm(hashes:string[]):Promise<Record<string,number>>{
  const response=await fetch(engineUrl('/api/torrents/swarm'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hashes})});
  const body=await response.json() as {seeders?:Record<string,number>};
  const seeders=body?.seeders??{},now=Date.now();
  for(const [hash,count] of Object.entries(seeders))known.set(hash,{count,at:now});
  if(known.size>3000)known.clear();
  return seeders;
}

/** Looks up live counts ahead of time (the next episode's sources). */
export function prefetchLiveSeeders(streams:Stream[]):Promise<void>{
  const hashes=hashesOf(streams).filter(hash=>remembered(hash)===undefined).slice(0,140);
  return hashes.length?askSwarm(hashes).then(()=>undefined,()=>undefined):Promise.resolve();
}

export function useLiveSeeders(streams:Stream[],enabled:boolean){
  const [counts,setCounts]=useState<Record<string,number>>({});
  const [pending,setPending]=useState(false);
  const asked=useRef(new Set<string>());
  const all=enabled?hashesOf(streams):[];
  const hashes=all.filter(hash=>!asked.current.has(hash)&&remembered(hash)===undefined);
  const key=hashes.join(','),allKey=all.join(',');
  useEffect(()=>{
    if(!enabled||!hashes.length)return;
    const batch=hashes.slice(0,140);batch.forEach(hash=>asked.current.add(hash));
    let live=true;setPending(true);
    // Never hold up playback for long if the trackers do not answer.
    const timer=setTimeout(()=>{if(live)setPending(false);},6000);
    askSwarm(batch)
      .then(seeders=>{if(live)setCounts(previous=>({...previous,...seeders}));})
      .catch(()=>{/* Listed counts stay in use. */})
      .finally(()=>{clearTimeout(timer);if(live)setPending(false);});
    return()=>{live=false;clearTimeout(timer);};
  },[enabled,key]);
  // Counts looked up earlier (before this episode started) apply at once.
  const merged=useMemo(()=>{
    const extra:Record<string,number>={};
    for(const hash of all){const count=remembered(hash);if(count!==undefined&&counts[hash]===undefined)extra[hash]=count;}
    return Object.keys(extra).length?{...counts,...extra}:counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[counts,allKey]);
  // Sources that arrived this render have not been asked yet: count them as
  // pending, or Play could start on a stale count before the check begins.
  return {counts:merged,pending:pending||hashes.length>0};
}
