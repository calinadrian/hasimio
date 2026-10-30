// Community intro, recap and credits timestamps from TheIntroDB. Requests stay
// in the engine so the browser avoids CORS and repeated episode lookups are cached.
export const SEGMENTS_URL='https://api.theintrodb.org/v3/media';
const EMPTY=()=>({provider:'TheIntroDB',intro:[],recap:[],credits:[],preview:[]});

export function imdbVideoId(value) {
  return typeof value==='string'&&/^tt\d{6,10}(?::\d{1,4}:\d{1,4})?$/.test(value);
}

const ms=value=>{
  if(value===null||value===undefined)return undefined;
  const number=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
  return Number.isFinite(number)?number:undefined;
};
const seconds=value=>Math.round(value)/1000;

function normalizeSegments(list,{credits=false}={}) {
  if(!Array.isArray(list))return [];
  const seen=new Set();
  return list.flatMap(item=>{
    if(!item||typeof item!=='object')return [];
    const startMs=item.start_ms==null?0:ms(item.start_ms),endMs=ms(item.end_ms);
    if(startMs===undefined||startMs<0)return [];
    const start=seconds(startMs);
    const end=endMs===undefined?undefined:seconds(endMs);
    if(end!==undefined&&end<=start)return [];
    if(credits&&start<=0)return [];
    const key=`${start}:${end??''}`;
    if(seen.has(key))return [];
    seen.add(key);
    return [{start,...(end===undefined?{}:{end})}];
  }).sort((a,b)=>a.start-b.start);
}

export function segmentSeconds(payload) {
  if(!payload||typeof payload!=='object')return EMPTY();
  return {
    provider:'TheIntroDB',
    intro:normalizeSegments(payload.intro),
    recap:normalizeSegments(payload.recap),
    credits:normalizeSegments(payload.credits,{credits:true}),
    preview:normalizeSegments(payload.preview),
  };
}

export async function fetchSkipSegments(videoId,durationMs,fetchImpl=fetch) {
  if(!imdbVideoId(videoId))throw new Error('Skip timestamps need an IMDb movie or episode ID.');
  const id=/^(tt\d+)(?::(\d{1,4}):(\d{1,4}))?$/.exec(videoId);
  async function request(withDuration) {
    const url=new URL(SEGMENTS_URL);
    url.searchParams.set('imdb_id',id[1]);
    if(id[2]!==undefined){url.searchParams.set('season',id[2]);url.searchParams.set('episode',id[3]);}
    if(withDuration&&Number.isFinite(durationMs)&&durationMs>=300000)url.searchParams.set('duration_ms',String(Math.round(durationMs)));
    let response;
    try{response=await fetchImpl(url,{signal:AbortSignal.timeout(15000),redirect:'error',headers:{Accept:'application/json'}});}
    catch{throw new Error('TheIntroDB could not be reached. Check your connection and try again.');}
    // A missing title or episode is a normal empty result, not a playback error.
    if(response.status===404)return EMPTY();
    if(!response.ok)throw new Error(`TheIntroDB returned HTTP ${response.status}.`);
    let payload;
    try{payload=await response.json();}
    catch{throw new Error('TheIntroDB returned an invalid response.');}
    return segmentSeconds(payload);
  }
  const result=await request(true);
  // A release-specific group can contain credits but omit the intro (or vice
  // versa). Merge the default episode group only for that partial result.
  if(Number.isFinite(durationMs)&&durationMs>=300000&&(!result.intro.length!==!result.credits.length)){
    try{
      const fallback=await request(false);
      return {
        ...result,
        intro:result.intro.length?result.intro:fallback.intro,
        recap:result.recap.length?result.recap:fallback.recap,
        credits:result.credits.length?result.credits:fallback.credits,
        preview:result.preview.length?result.preview:fallback.preview,
      };
    }catch{/* Keep the usable half rather than failing playback markers. */}
  }
  return result;
}

export function createSkipSegmentLookup({fetchImpl=fetch,now=Date.now,successTtl=6*60*60*1000,missTtl=30*60*1000,failureTtl=5*60*1000,limit=300}={}) {
  const cache=new Map(),pending=new Map();
  const store=(key,entry)=>{
    if(cache.size>=limit&&!cache.has(key))cache.delete(cache.keys().next().value);
    cache.set(key,entry);
  };
  return async function lookup(videoId,durationMs) {
    const durationKey=Number.isFinite(durationMs)&&durationMs>0?Math.round(durationMs/30000):0;
    const key=`${videoId}|${durationKey}`;
    const cached=cache.get(key);
    if(cached){
      if(cached.expires<=now())cache.delete(key);
      else if(cached.error)throw cached.error;
      else return cached.value;
    }
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      try{
        const value=await fetchSkipSegments(videoId,durationMs,fetchImpl);
        const empty=!value.intro.length&&!value.credits.length;
        store(key,{value,expires:now()+(empty?missTtl:successTtl)});
        return value;
      }catch(error){
        const failure=error instanceof Error?error:new Error('Skip timestamps are unavailable.');
        store(key,{error:failure,expires:now()+failureTtl});
        throw failure;
      }finally{
        pending.delete(key);
      }
    })();
    pending.set(key,task);
    return task;
  };
}
