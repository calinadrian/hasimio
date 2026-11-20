import {profileStorage} from './profile-storage';

// Timing belongs to one subtitle version on one video. A single global delay
// carried a fix for one film into every later film, where it was wrong again.
export type SubtitleTiming={delay:number;speed:number};
export const NO_TIMING:SubtitleTiming={delay:0,speed:1};
// Subtitles cut for 25 fps (PAL) releases drift against 23.976 fps video by
// about 4.3%: in sync at the start, minutes off by the end.
export const PAL_RATIO=25/23.976;
export const DRIFT_CHOICES=[
  {speed:1,label:'Off'},
  {speed:PAL_RATIO,label:'Stretch (25 → 23.976 fps)'},
  {speed:1/PAL_RATIO,label:'Shrink (23.976 → 25 fps)'},
] as const;
export const TIMING_STEP=0.5,FINE_STEP=0.1,REMOTE_STEP=0.25;
const storeKey='hasimio:subtitle-timing:v1',LIMIT=300,MAX_DELAY=120;

type SubtitleIdentity={online?:string;url?:string;label?:string;language?:string};
export function subtitleTimingKey(video:string|undefined,subtitle:SubtitleIdentity|undefined){
  if(!video||!subtitle)return undefined;
  const id=subtitle.online?'online:'+subtitle.online:subtitle.url?'url:'+subtitle.url:`file:${subtitle.language??''}:${subtitle.label??''}`;
  return video+'|'+id;
}

type Stored=Record<string,SubtitleTiming&{at:number}>;
function read():Stored{
  try{const value=JSON.parse(profileStorage.getItem(storeKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
const valid=(value:unknown):value is SubtitleTiming=>!!value&&typeof value==='object'&&Number.isFinite((value as SubtitleTiming).delay)&&Number.isFinite((value as SubtitleTiming).speed)&&(value as SubtitleTiming).speed>0.5&&(value as SubtitleTiming).speed<2;
export function savedTiming(id:string):SubtitleTiming|undefined{
  const value=read()[id];return valid(value)?{delay:value.delay,speed:value.speed}:undefined;
}
export function saveTiming(id:string,timing:SubtitleTiming){
  const all=read();
  if(timing.delay===0&&timing.speed===1)delete all[id];else all[id]={delay:timing.delay,speed:timing.speed,at:Date.now()};
  const kept=Object.entries(all).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).slice(0,LIMIT);
  try{profileStorage.setItem(storeKey,JSON.stringify(Object.fromEntries(kept)));}catch{/* Timing still applies for this session. */}
}

export function nudgeTiming(timing:SubtitleTiming,seconds:number):SubtitleTiming{
  const delay=Math.round((timing.delay+seconds)*100)/100;
  return {...timing,delay:Math.max(-MAX_DELAY,Math.min(MAX_DELAY,Object.is(delay,-0)?0:delay))};
}
/** Video-element times for a cue, after the speed fix, the delay and any stream offset. */
export function timedCue(start:number,end:number,timing:SubtitleTiming,timeOffset=0){
  return {start:start*timing.speed+timing.delay-timeOffset,end:end*timing.speed+timing.delay-timeOffset};
}
/**
 * Subtitles made for a slower (23.976 fps) cut run past the end of a 25 fps
 * video. Matching subtitles end before the credits, so a last cue well beyond
 * the video's length is a reliable sign. The opposite case cannot be told
 * apart from long credits, so it stays a manual choice.
 */
export function detectFrameRateDrift(lastCueEnd:number,duration:number){
  if(!(duration>600)||!(lastCueEnd>0))return undefined;
  const ratio=lastCueEnd/duration;
  return ratio>1.015&&ratio<1.06?1/PAL_RATIO:undefined;
}
export function describeDelay(delay:number){
  if(Math.abs(delay)<0.005)return 'In sync with the original timing';
  const amount=Math.abs(delay).toFixed(2).replace(/0$/,'').replace(/\.0$/,'');
  return `Shown ${amount} s ${delay>0?'later':'earlier'}`;
}
