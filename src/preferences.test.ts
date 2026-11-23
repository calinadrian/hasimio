import {describe,expect,it} from 'vitest';
import {defaultSettings,preferredQualityFor,qualityKind,validSetting} from './preferences';
import {bestSource} from './stream-options';

describe('quality per kind of title',()=>{
  it('groups titles like the Movie / Series / Anime card label',()=>{
    expect(qualityKind({type:'movie'})).toBe('movie');
    expect(qualityKind({type:'series'})).toBe('series');
    expect(qualityKind({type:'anime'})).toBe('anime');
    expect(qualityKind({type:'series',category:'anime'})).toBe('anime');
    expect(qualityKind({type:'movie',category:'anime'})).toBe('anime');
    expect(qualityKind(undefined)).toBe('movie');
  });
  it('uses the general preference until a kind has its own',()=>{
    const settings={...defaultSettings,preferredQuality:'720p' as const};
    expect(preferredQualityFor(settings,'movie')).toBe('720p');
    expect(preferredQualityFor({...settings,seriesQuality:'4K'},'series')).toBe('4K');
    expect(preferredQualityFor({...settings,seriesQuality:'4K'},'anime')).toBe('720p');
  });
  it('accepts only known qualities for each kind',()=>{
    for(const key of ['movieQuality','seriesQuality','animeQuality']){
      expect(validSetting(key,'1080p')).toBe(true);
      expect(validSetting(key,'8K')).toBe(false);
      expect(validSetting(key,720)).toBe(false);
    }
  });
  it('plays the tier chosen for that kind',()=>{
    const streams=[{title:'Show.S01E01.720p.WEB',infoHash:'a'.repeat(40)},{title:'Show.S01E01.1080p.WEB',infoHash:'b'.repeat(40)},{title:'Show.S01E01.2160p.WEB',infoHash:'c'.repeat(40)}];
    const settings={...defaultSettings,preferredQuality:'1080p' as const,animeQuality:'720p' as const,movieQuality:'4K' as const};
    const pick=(kind:'movie'|'series'|'anime')=>bestSource(streams,{...settings,autoSubtitles:false,preferredQuality:preferredQualityFor(settings,kind)},'tt1')?.title;
    expect(pick('movie')).toContain('2160p');
    expect(pick('series')).toContain('1080p');
    expect(pick('anime')).toContain('720p');
  });
});
