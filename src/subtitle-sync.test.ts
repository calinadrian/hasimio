import {describe,expect,it} from 'vitest';
import {alignSubtitles,isCamRelease,negligible,syncReferences,type TimedCue} from './subtitle-sync';

// Deterministic dialogue track: lines of 1-4 s with 0.5-8 s pauses, ~2.9 hours.
function dialogue(count:number,seed=7):TimedCue[]{
  let state=seed,time=30;const random=()=>{state=(state*1103515245+12345)%2147483648;return state/2147483648;};
  return Array.from({length:count},()=>{const start=time+0.5+random()*7.5,end=start+1+random()*3;time=end;return {start,end};});
}
// The same dialogue as cut for another release: shifted, at another speed,
// with jitter and some lines merged or missing, as in a translation.
function otherRelease(reference:TimedCue[],speed:number,delay:number,seed=3){
  let state=seed;const random=()=>{state=(state*1103515245+12345)%2147483648;return state/2147483648;};
  return reference.filter(()=>random()>0.12).map(cue=>{const jitter=(random()-0.5)*0.3;return {start:(cue.start-delay)/speed+jitter,end:(cue.end-delay)/speed+jitter};});
}

describe('automatic subtitle sync',()=>{
  const reference=dialogue(1900);

  it('recovers a 23.976/24 fps drift plus an offset (cinema recording vs Blu-ray)',()=>{
    const result=alignSubtitles(reference,otherRelease(reference,24/23.976,2.13))!;
    expect(result.speed).toBeCloseTo(24/23.976,6);
    expect(result.delay).toBeCloseTo(2.13,0);
    expect(result.matched).toBeGreaterThan(0.8);
    expect(result.confidence).toBe('high');
  });

  it('recovers PAL speed-up and large offsets',()=>{
    const result=alignSubtitles(reference,otherRelease(reference,25/23.976,-41.5))!;
    expect(result.speed).toBeCloseTo(25/23.976,6);
    expect(result.delay).toBeCloseTo(-41.5,0);
  });

  it('reports matching subtitles as needing no change',()=>{
    const result=alignSubtitles(reference,otherRelease(reference,1,0))!;
    expect(negligible(result)).toBe(true);
  });

  it('does not claim confidence for unrelated subtitles',()=>{
    expect(alignSubtitles(reference,dialogue(1700,99))!.confidence).toBe('low');
    expect(alignSubtitles(reference.slice(0,10),reference.slice(0,10))).toBeUndefined();
  });

  it('recognises cinema recordings',()=>{
    expect(isCamRelease('The.Odyssey.2026.1080p.TELESYNC.HEVC-SLH')).toBe(true);
    expect(isCamRelease('Movie.2025.HDTS.x264')).toBe(true);
    expect(isCamRelease('Movie.2025.1080p.BluRay.x264-SPARKS')).toBe(false);
    expect(isCamRelease('Mutts.2020.WEB-DL')).toBe(false);
  });

  it('syncs only against versions that fit the video better, never cam ones',()=>{
    const versions=[
      {id:'ro',release:'The.Odyssey.2026.1080p.TELESYNC.HEVC-SLH',match:0.2},
      {id:'en-bd',release:'The.Odyssey.2026.1080p.Bluray.x265-NeoNoir',match:0.9},
      {id:'en-ts',release:'The.Odyssey.2026.HDTS',match:0.6},
      {id:'fr',release:'The Odyssey 2026',match:0.3},
    ];
    const video='The.Odyssey.2026.1080p.BluRay.x265-NeoNoir.mkv';
    // A title-only match (fr, 0.3) is not clearly better than the target, so it is no reference.
    expect(syncReferences(versions,versions[0],video).map(item=>item.id)).toEqual(['en-bd']);
    // The chosen version already fits this video.
    expect(syncReferences(versions,{...versions[1]},video)).toEqual([]);
    // The video itself is a cinema recording: leave cam subtitles alone.
    expect(syncReferences(versions,versions[0],'The.Odyssey.2026.TELESYNC.mkv')).toEqual([]);
    // Unknown file name: only a cam subtitle is corrected, using non-cam references.
    const unranked=versions.map(item=>({...item,match:0}));
    expect(syncReferences(unranked,unranked[0],undefined).map(item=>item.id)).toEqual(['en-bd','fr']);
    expect(syncReferences(unranked,unranked[1],undefined)).toEqual([]);
  });
});
