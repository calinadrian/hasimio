import {describe,it,expect,vi} from 'vitest';
import {creditsStart,fetchSkipSegments,introSegmentAt,parseSkipSegments,upNextStart} from './skip-segments';

const segments=parseSkipSegments({
  provider:'TheIntroDB',
  intro:[{start:20,end:80}],
  credits:[{start:1400}],
})!;

describe('skip segments',()=>{
  it('parses normalized timestamp arrays',()=>{
    expect(segments).toEqual({provider:'TheIntroDB',intro:[{start:20,end:80}],recap:[],credits:[{start:1400}],preview:[]});
    expect(parseSkipSegments({intro:[],credits:[]})).toBeUndefined();
    expect(parseSkipSegments({intro:[{start:'20',end:80},{start:30,end:20}]})).toBeUndefined();
  });
  it('shows Skip intro only inside an intro with a known end',()=>{
    expect(introSegmentAt(segments,20)).toEqual({start:20,end:80});
    expect(introSegmentAt(segments,79.9)).toEqual({start:20,end:80});
    expect(introSegmentAt(segments,80)).toBeUndefined();
    expect(introSegmentAt({...segments,intro:[{start:20}]},21)).toBeUndefined();
  });
  it('opens Up next at known credits and otherwise keeps the end-of-episode fallback',()=>{
    expect(creditsStart(segments,2400)).toBe(1400);
    expect(upNextStart(segments,2400)).toBe(1400);
    expect(upNextStart({...segments,credits:[{start:100}]},2400)).toBe(2355);
    expect(upNextStart(undefined,2400)).toBe(2355);
    expect(upNextStart(undefined,30)).toBe(27);
  });
  it('requests markers only for IMDb ids and tolerates missing results',async()=>{
    const fetchImpl=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({available:true,provider:'TheIntroDB',intro:[{start:5,end:25}],credits:[{start:1300}]})));
    const result=await fetchSkipSegments('tt0903747:1:1',{durationMs:2400000,fetchImpl});
    expect(result?.intro).toEqual([{start:5,end:25}]);
    const url=new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/segments');
    expect(url.searchParams.get('videoId')).toBe('tt0903747:1:1');
    expect(url.searchParams.get('durationMs')).toBe('2400000');
    expect(await fetchSkipSegments('kitsu:1',{fetchImpl})).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await fetchSkipSegments('tt0903747:1:1',{fetchImpl:vi.fn(async()=>new Response('',{status:502}))})).toBeUndefined();
  });
});
