import {useEffect,useRef,useState} from 'react';
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

export function useLiveSeeders(streams:Stream[],enabled:boolean){
  const [counts,setCounts]=useState<Record<string,number>>({});
  const [pending,setPending]=useState(false);
  const asked=useRef(new Set<string>());
  const hashes=enabled?streams.map(stream=>stream.infoHash?.toLowerCase()).filter((hash):hash is string=>!!hash&&!asked.current.has(hash)):[];
  const key=hashes.join(',');
  useEffect(()=>{
    if(!enabled||!hashes.length)return;
    const batch=hashes.slice(0,140);batch.forEach(hash=>asked.current.add(hash));
    let live=true;setPending(true);
    // Never hold up playback for long if the trackers do not answer.
    const timer=setTimeout(()=>{if(live)setPending(false);},6000);
    fetch(engineUrl('/api/torrents/swarm'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hashes:batch})})
      .then(response=>response.json()).then(body=>{if(live&&body?.seeders)setCounts(previous=>({...previous,...body.seeders}));})
      .catch(()=>{/* Listed counts stay in use. */})
      .finally(()=>{clearTimeout(timer);if(live)setPending(false);});
    return()=>{live=false;clearTimeout(timer);};
  },[enabled,key]);
  // Sources that arrived this render have not been asked yet: count them as
  // pending, or Play could start on a stale count before the check begins.
  return {counts,pending:pending||hashes.length>0};
}
