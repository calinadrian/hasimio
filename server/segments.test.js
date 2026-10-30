import {describe,it,expect,vi} from 'vitest';
import {createSkipSegmentLookup,fetchSkipSegments,imdbVideoId,segmentSeconds} from './segments.mjs';
import {createMediaService} from './service.mjs';

const payload={
  intro:[{start_ms:228583,end_ms:246569}],
  recap:[{start_ms:null,end_ms:42000}],
  credits:[{start_ms:3431000,end_ms:null}],
};

describe('intro and credits timestamps',()=>{
  it('converts TheIntroDB milliseconds to sorted seconds',()=>{
    expect(segmentSeconds(payload)).toEqual({
      provider:'TheIntroDB',
      intro:[{start:228.583,end:246.569}],
      recap:[{start:0,end:42}],
      credits:[{start:3431}],
      preview:[],
    });
  });
  it('drops malformed, duplicate and zero-start credits markers',()=>{
    expect(segmentSeconds({
      intro:[{start_ms:9000,end_ms:8000},{start_ms:'bad',end_ms:1000},{start_ms:1000,end_ms:2000},{start_ms:1000,end_ms:2000}],
      credits:[{start_ms:0,end_ms:null},{start_ms:5000,end_ms:null}],
    })).toMatchObject({intro:[{start:1,end:2}],credits:[{start:5}]});
  });
  it('only accepts IMDb movie and episode ids',()=>{
    expect(imdbVideoId('tt0903747')).toBe(true);
    expect(imdbVideoId('tt0903747:1:2')).toBe(true);
    expect(imdbVideoId('kitsu:1')).toBe(false);
    expect(imdbVideoId('tt0903747:1')).toBe(false);
  });
  it('asks for the exact episode and duration',async()=>{
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(payload)));
    expect(await fetchSkipSegments('tt0903747:1:1',2880000,fetchImpl)).toMatchObject({intro:[{start:228.583}]});
    const url=fetchImpl.mock.calls[0][0];
    expect(url.searchParams.get('imdb_id')).toBe('tt0903747');
    expect(url.searchParams.get('season')).toBe('1');
    expect(url.searchParams.get('episode')).toBe('1');
    expect(url.searchParams.get('duration_ms')).toBe('2880000');
    await expect(fetchSkipSegments('kitsu:1',undefined,fetchImpl)).rejects.toThrow('IMDb');
  });
  it('treats a missing episode as an empty result',async()=>{
    const fetchImpl=vi.fn(async()=>new Response('{"error":"missing"}',{status:404}));
    expect(await fetchSkipSegments('tt9999999:1:1',undefined,fetchImpl)).toEqual({provider:'TheIntroDB',intro:[],recap:[],credits:[],preview:[]});
  });
  it('fills a missing intro or credits half from the default episode group',async()=>{
    const fetchImpl=vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({credits:[{start_ms:3432500,end_ms:null}]})))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    const result=await fetchSkipSegments('tt0903747:1:1',2880000,fetchImpl);
    expect(result).toMatchObject({intro:[{start:228.583,end:246.569}],credits:[{start:3432.5}]});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0].searchParams.get('duration_ms')).toBe('2880000');
    expect(fetchImpl.mock.calls[1][0].searchParams.has('duration_ms')).toBe(false);
  });
});

describe('timestamp lookup cache',()=>{
  it('reuses successful episode data and keeps duration variants separate',async()=>{
    let clock=0;
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(payload)));
    const lookup=createSkipSegmentLookup({fetchImpl,now:()=>clock});
    await lookup('tt0903747:1:1',2880000);
    await lookup('tt0903747:1:1',2881000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock+=7*60*60*1000;
    await lookup('tt0903747:1:1',2880000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await lookup('tt0903747:1:1',3600000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('caches empty and failed lookups for their shorter lifetimes',async()=>{
    let clock=0;
    const empty=vi.fn(async()=>new Response('{}',{status:404}));
    const miss=createSkipSegmentLookup({fetchImpl:empty,now:()=>clock});
    await miss('tt1234567:1:1',undefined);
    await miss('tt1234567:1:1',undefined);
    expect(empty).toHaveBeenCalledTimes(1);
    clock+=31*60*1000;
    await miss('tt1234567:1:1',undefined);
    expect(empty).toHaveBeenCalledTimes(2);

    clock=0;
    const failure=vi.fn(async()=>new Response('nope',{status:503}));
    const retry=createSkipSegmentLookup({fetchImpl:failure,now:()=>clock});
    await expect(retry('tt1234567:1:2',undefined)).rejects.toThrow('HTTP 503');
    await expect(retry('tt1234567:1:2',undefined)).rejects.toThrow('HTTP 503');
    expect(failure).toHaveBeenCalledTimes(1);
    clock+=6*60*1000;
    await expect(retry('tt1234567:1:2',undefined)).rejects.toThrow('HTTP 503');
    expect(failure).toHaveBeenCalledTimes(2);
  });
});

describe('skip segment endpoint',()=>{
  const reply=async(service,url)=>{
    let status,body;
    await service.handle({method:'GET',url,headers:{host:'127.0.0.1:11475'},socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},writeHead(code){status=code;},end(text){body=JSON.parse(text);}});
    return {status,body};
  };
  it('serves cached markers and rejects ids without an IMDb mapping',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify(payload)));
    const service=createMediaService({fetchImpl:fetch,titles:{close:async()=>{}},allowedOrigins:new Set()});
    try{
      const url='/api/segments?videoId=tt0903747%3A1%3A1&durationMs=2880000';
      expect((await reply(service,url)).body).toMatchObject({available:true,intro:[{start:228.583}],credits:[{start:3431}]});
      await reply(service,url);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect((await reply(service,'/api/segments?videoId=kitsu%3A1')).status).toBe(400);
    }finally{
      await service.close();
    }
  });
});
