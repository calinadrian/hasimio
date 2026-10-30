import {engineUrl} from './engine';

export type SkipSegment={start:number;end?:number};
export type SkipSegments={provider?:string;intro:SkipSegment[];recap:SkipSegment[];credits:SkipSegment[];preview:SkipSegment[]};

const imdbId=/^tt\d{6,10}(?::\d{1,4}:\d{1,4})?$/;

function segmentList(value:unknown):SkipSegment[] {
  if(!Array.isArray(value))return [];
  return value.flatMap(item=>{
    if(!item||typeof item!=='object')return [];
    const {start,end}=item as {start?:unknown;end?:unknown};
    if(typeof start!=='number'||!Number.isFinite(start)||start<0)return [];
    if(end!==undefined&&(typeof end!=='number'||!Number.isFinite(end)||end<=start))return [];
    return [{start,...(typeof end==='number'?{end}:{})}];
  }).sort((a,b)=>a.start-b.start);
}

export function parseSkipSegments(payload:unknown):SkipSegments|undefined {
  if(!payload||typeof payload!=='object')return;
  const data=payload as Record<string,unknown>;
  const segments={provider:typeof data.provider==='string'?data.provider:undefined,intro:segmentList(data.intro),recap:segmentList(data.recap),credits:segmentList(data.credits),preview:segmentList(data.preview)};
  if(!segments.intro.length&&!segments.recap.length&&!segments.credits.length&&!segments.preview.length)return;
  return segments;
}

export function introSegmentAt(segments:SkipSegments|undefined,position:number):SkipSegment|undefined {
  return segments?.intro.find(segment=>segment.end!==undefined&&segment.end>segment.start&&position>=segment.start&&position<segment.end);
}

// Do not trust a credits marker in the first half of a video; a bad timestamp
// would otherwise open Up next far too early.
export function creditsStart(segments:SkipSegments|undefined,duration:number):number|undefined {
  if(!Number.isFinite(duration)||duration<=0)return;
  const starts=(segments?.credits??[]).map(segment=>segment.start).filter(start=>Number.isFinite(start)&&start>=duration*0.5&&start<duration-1);
  return starts.length?Math.min(...starts):undefined;
}

export function upNextStart(segments:SkipSegments|undefined,duration:number):number {
  return creditsStart(segments,duration)??Math.max(duration-45,duration*0.9);
}

export async function fetchSkipSegments(videoId:string|undefined,{durationMs,fetchImpl=fetch,signal}:{durationMs?:number;fetchImpl?:typeof fetch;signal?:AbortSignal}={}):Promise<SkipSegments|undefined> {
  if(!videoId||!imdbId.test(videoId))return;
  const url=new URL(engineUrl('/api/segments'));
  url.searchParams.set('videoId',videoId);
  if(Number.isFinite(durationMs)&&(durationMs??0)>0)url.searchParams.set('durationMs',String(Math.round(durationMs!)));
  const timeout=AbortSignal.timeout(8000);
  const requestSignal=signal&&typeof AbortSignal.any==='function'?AbortSignal.any([signal,timeout]):timeout;
  try{
    const response=await fetchImpl(url,{cache:'no-store',signal:requestSignal});
    if(!response.ok)return;
    return parseSkipSegments(await response.json());
  }catch{
    // Intro and credits markers are optional; playback keeps the timing fallback.
    return;
  }
}
