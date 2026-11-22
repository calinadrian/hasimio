import {describe,expect,it} from 'vitest';
import {automaticCandidates,sourceNames,SUBTITLE_SOURCES} from './online-subtitle-order';

const item=(id:string,provider:string|undefined,match:number,language='rum')=>({id,provider,match,language});

describe('automatic online subtitle order',()=>{
  it('tries the closest releases first, then the best version from every other site',()=>{
    const results=[item('a',undefined,0.9),item('b',undefined,0.8),item('c',undefined,0.7),item('d',undefined,0.6),item('e','subs.ro',0.5),item('f','subs.ro',0.4),item('g','YIFY Subtitles',0.1),item('h',undefined,0.9,'eng')];
    expect(automaticCandidates(results,'rum').map(value=>value.id)).toEqual(['a','b','c','e','g','d','f']);
    expect(automaticCandidates(results,'rum',4).map(value=>value.id)).toEqual(['a','b','c','e']);
    expect(automaticCandidates(results,'eng').map(value=>value.id)).toEqual(['h']);
  });
  it('names the sites that answered for the language',()=>{
    const results=[item('a','subs.ro',0.5),item('b',undefined,0.4),item('c','subs.ro',0.3),item('d','Addic7ed',0.2,'eng')];
    expect(sourceNames(results,'rum')).toBe('subs.ro · OpenSubtitles');
    expect(sourceNames([],'rum')).toBe(SUBTITLE_SOURCES);
  });
});
