import {describe,expect,it} from 'vitest';
import {cachedStreams,forgetStreams,storeStreams,streamCacheKey} from './stream-cache';
import type {Stream} from './media';

const stream=(name:string):Stream=>({name,infoHash:'a'.repeat(40)} as Stream);

describe('sources kept for the next episode',()=>{
  it('returns what was found for the same episode and sources, regardless of source order',()=>{
    forgetStreams();
    const key=streamCacheKey('series','tt1:1:2',[{url:'b'},{url:'a'}]);
    storeStreams(key,[stream('1080p')],1000);
    expect(cachedStreams(streamCacheKey('series','tt1:1:2',[{url:'a'},{url:'b'}]),2000)?.map(s=>s.name)).toEqual(['1080p']);
    expect(cachedStreams(streamCacheKey('series','tt1:1:3',[{url:'a'},{url:'b'}]),2000)).toBeUndefined();
  });
  it('forgets answers after twenty minutes, and never keeps an empty one',()=>{
    forgetStreams();
    const key=streamCacheKey('series','tt1:1:2',[{url:'a'}]);
    storeStreams(key,[],0);
    expect(cachedStreams(key,1)).toBeUndefined();
    storeStreams(key,[stream('720p')],0);
    expect(cachedStreams(key,20*60*1000+1)).toBeUndefined();
  });
  it('keeps only the most recent episodes',()=>{
    forgetStreams();
    for(let index=0;index<15;index++)storeStreams(streamCacheKey('series','e'+index,[]),[stream('s'+index)],0);
    expect(cachedStreams(streamCacheKey('series','e0',[]),1)).toBeUndefined();
    expect(cachedStreams(streamCacheKey('series','e14',[]),1)).toBeDefined();
  });
});
