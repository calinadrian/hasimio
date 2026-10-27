import {describe,it,expect} from 'vitest';
import {playbackTime,seekPosition} from './player-utils';
describe('player timeline',()=>{
  it('formats seconds, feature-length movies, and unavailable live duration',()=>{expect(playbackTime(65.9)).toBe('1:05');expect(playbackTime(7265)).toBe('2:01:05');expect(playbackTime(Infinity)).toBe('--:--');expect(playbackTime(NaN)).toBe('--:--');});
  it('clamps skips to actual prepared video, including nonzero seekable windows',()=>{expect(seekPosition(-10,0,80)).toBe(0);expect(seekPosition(100,0,80)).toBe(80);expect(seekPosition(12,30,90)).toBe(30);expect(seekPosition(45,30,90)).toBe(45);});
  it('does not seek before metadata or with invalid media timing',()=>{expect(seekPosition(10,0,0)).toBeUndefined();expect(seekPosition(10,0,Infinity)).toBeUndefined();expect(seekPosition(NaN,0,60)).toBeUndefined();});
});
