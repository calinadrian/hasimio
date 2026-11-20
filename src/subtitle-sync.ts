// Automatic subtitle sync against a reference subtitle that matches the video.
//
// A subtitle cut for another release (a cinema TELESYNC, a 25 fps TV master,
// a cut with a different intro) is off by a constant offset, a speed factor,
// or both. A subtitle made for this video's release, in any language, follows
// the same dialogue. Lining up when lines start in both gives the correction
// without analysing audio, cheaply enough for an old TV.

export type TimedCue={start:number;end:number};
export type SyncResult={speed:number;delay:number;matched:number;confidence:'high'|'low'};

// Common release speeds: 23.976, 24 and 25 fps masters played at each other's rate.
const SPEEDS=[1,25/23.976,23.976/25,24/23.976,23.976/24,25/24,24/25];
const MAX_OFFSET=600,BIN=0.2,MATCH=0.6;

/** Fraction of target lines that start within MATCH seconds of a reference line once corrected. */
function matchedShare(reference:number[],target:number[],speed:number,delay:number){
  let j=0,hits=0;
  for(const time of target){
    const corrected=time*speed+delay;
    while(j<reference.length-1&&reference[j+1]<=corrected)j++;
    const near=Math.min(Math.abs(reference[j]-corrected),j+1<reference.length?Math.abs(reference[j+1]-corrected):Infinity);
    if(near<=MATCH)hits++;
  }
  return hits/target.length;
}

/** Best offset for one speed: the peak of the histogram of start-time differences. */
function bestDelay(reference:number[],target:number[],speed:number){
  const bins=new Map<number,number>();
  let lo=0;
  for(const time of target){
    const scaled=time*speed;
    while(lo<reference.length&&reference[lo]<scaled-MAX_OFFSET)lo++;
    for(let j=lo;j<reference.length&&reference[j]<=scaled+MAX_OFFSET;j++){
      const bin=Math.round((reference[j]-scaled)/BIN);
      bins.set(bin,(bins.get(bin)||0)+1);
    }
  }
  let peak=0,count=-1;
  // Smooth over neighbouring bins so a peak split across two bins still wins.
  bins.forEach((value,bin)=>{const total=value+(bins.get(bin-1)||0)+(bins.get(bin+1)||0);if(total>count){count=total;peak=bin;}});
  // Refine: median of the differences close to the peak.
  const near:number[]=[];
  for(const time of target){
    const scaled=time*speed;
    for(const start of reference){const difference=start-scaled;if(Math.abs(difference-peak*BIN)<=BIN*2)near.push(difference);}
  }
  near.sort((a,b)=>a-b);
  return near.length?near[Math.floor(near.length/2)]:peak*BIN;
}

const CAM=/\b(cam|hdcam|camrip|ts|hdts|telesync|tc|telecine)\b/i;
/** Cinema recordings: their timing almost never fits a proper release. */
export function isCamRelease(name:string){return CAM.test(String(name||'').replace(/[._-]/g,' '));}

type Version={id:string;release:string;match:number};
/**
 * Versions worth syncing `target` against, best first. Syncing only happens
 * when the target was clearly cut for another release: a reference must match
 * this video's file name noticeably better, or the target is a cinema
 * recording while the video is not. Cam references are never used.
 */
export function syncReferences<T extends Version>(results:readonly T[],target:Version,filename?:string,limit=2):T[]{
  if(isCamRelease(filename||''))return [];
  const ranked=!!filename&&results.some(item=>item.match>0);
  if(ranked&&target.match>=0.5)return [];
  return results
    .filter(item=>item.id!==target.id&&!isCamRelease(item.release))
    .filter(item=>ranked?item.match>=0.3&&item.match>=target.match+0.15:isCamRelease(target.release))
    .sort((a,b)=>b.match-a.match)
    .slice(0,limit);
}
/** True when a correction is too small to be worth applying. */
export function negligible(result:SyncResult){return Math.abs(result.speed-1)<1e-4&&Math.abs(result.delay)<0.3;}

/**
 * Speed and delay that map `target` cue times onto `reference` (apply as
 * time*speed+delay). Returns undefined when neither subtitle has enough lines.
 * Confidence is high when most lines line up and the winner clearly beats the
 * other speeds; low results should be offered, not applied silently.
 */
export function alignSubtitles(reference:readonly TimedCue[],target:readonly TimedCue[]):SyncResult|undefined{
  const ref=reference.map(cue=>cue.start).filter(Number.isFinite).sort((a,b)=>a-b);
  const tgt=target.map(cue=>cue.start).filter(Number.isFinite).sort((a,b)=>a-b);
  if(ref.length<40||tgt.length<40)return undefined;
  const results=SPEEDS.map(speed=>{const delay=bestDelay(ref,tgt,speed);return {speed,delay,matched:matchedShare(ref,tgt,speed,delay)};}).sort((a,b)=>b.matched-a.matched);
  const [best,second]=results;
  const confidence=best.matched>=0.35&&best.matched>=second.matched*1.5?'high':'low';
  return {speed:best.speed,delay:Math.round(best.delay*100)/100,matched:Math.round(best.matched*100)/100,confidence};
}
