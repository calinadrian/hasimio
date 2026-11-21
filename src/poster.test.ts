import {describe,expect,it} from 'vitest';
import {finishedTag,shortEpisode,timeLeft} from './Poster';

describe('poster card info line',()=>{
  it('says how long is left in words',()=>{
    expect(timeLeft(51*60+11)).toBe('51m left');
    expect(timeLeft(99*60+26)).toBe('1h 39m left');
    expect(timeLeft(120*60)).toBe('2h left');
    expect(timeLeft(20)).toBe('Almost done');
  });
  it('keeps the episode short enough for one line',()=>{
    expect(shortEpisode('S1 · E2/10')).toBe('S1 E2');
    expect(shortEpisode('S1 · E3')).toBe('S1 E3');
    expect(shortEpisode('Specials · E3/4')).toBe('Special E3');
    expect(shortEpisode(undefined)).toBeUndefined();
  });
  it('tags finished titles briefly',()=>{
    expect(finishedTag('Watched')).toBe('Watched');
    expect(finishedTag('Caught up')).toBe('Caught up');
    expect(finishedTag('Watched through S1 · E3/8')).toBe('Watched');
    expect(finishedTag('3/8 episodes watched')).toBe('3/8 watched');
  });
});
