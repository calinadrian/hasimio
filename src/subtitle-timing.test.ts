import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NO_TIMING,PAL_RATIO,describeDelay,detectFrameRateDrift,nudgeTiming,saveTiming,savedTiming,subtitleTimingKey,timedCue} from './subtitle-timing';

describe('subtitle timing',()=>{
  beforeEach(()=>{
    const data=new Map<string,string>();
    vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)});
  });

  it('keys timing by video and subtitle version, not globally',()=>{
    expect(subtitleTimingKey('tt1',{online:'42',label:'x',language:'rum'})).toBe('tt1|online:42');
    expect(subtitleTimingKey('tt1',{label:'Film.srt',language:'eng'})).toBe('tt1|file:eng:Film.srt');
    expect(subtitleTimingKey(undefined,{online:'42'})).toBeUndefined();
    expect(subtitleTimingKey('tt1',undefined)).toBeUndefined();
  });

  it('remembers a correction for one version only',()=>{
    saveTiming('tt1|online:1',{delay:-1.5,speed:1});
    expect(savedTiming('tt1|online:1')).toEqual({delay:-1.5,speed:1});
    expect(savedTiming('tt1|online:2')).toBeUndefined();
    saveTiming('tt1|online:1',NO_TIMING);
    expect(savedTiming('tt1|online:1')).toBeUndefined();
  });

  it('nudges in clean steps and clamps large offsets',()=>{
    expect(nudgeTiming(NO_TIMING,0.25)).toEqual({delay:0.25,speed:1});
    expect(nudgeTiming({delay:0.1,speed:1},-0.1).delay).toBe(0);
    expect(nudgeTiming({delay:119.9,speed:1},5).delay).toBe(120);
  });

  it('applies the frame-rate fix before the delay',()=>{
    const cue=timedCue(100,102,{delay:1,speed:PAL_RATIO},10);
    expect(cue.start).toBeCloseTo(100*PAL_RATIO+1-10,5);
    expect(cue.end).toBeCloseTo(102*PAL_RATIO+1-10,5);
  });

  it('detects subtitles cut for a slower release',()=>{
    expect(detectFrameRateDrift(6000*PAL_RATIO*0.99,6000)).toBeCloseTo(1/PAL_RATIO,5);
    expect(detectFrameRateDrift(5800,6000)).toBeUndefined();
    expect(detectFrameRateDrift(700,300)).toBeUndefined();
  });

  it('describes the offset in plain words',()=>{
    expect(describeDelay(0)).toBe('In sync with the original timing');
    expect(describeDelay(1.5)).toBe('Shown 1.5 s later');
    expect(describeDelay(-0.25)).toBe('Shown 0.25 s earlier');
    expect(describeDelay(-2)).toBe('Shown 2 s earlier');
  });
});
