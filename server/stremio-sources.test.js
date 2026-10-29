import {afterEach,describe,it,expect,vi} from 'vitest';
import {stremioResults,searchStremioSource} from './stremio-sources.mjs';
import {createMediaService} from './service.mjs';
import {selectVideo} from './torrent-utils.mjs';
const hash='a'.repeat(40);
const payload={streams:[{infoHash:hash,fileIdx:2,name:'Torrentio\n1080p',title:'Film x265\n👤 19 💾 1.5 GB',behaviorHints:{filename:'Film.mkv'}}]};
afterEach(()=>vi.unstubAllEnvs());
describe('Torrentio and Comet sources',()=>{
  it('maps torrent details and preserves the provider file index',()=>{
    expect(stremioResults(payload,'Torrentio').streams[0]).toMatchObject({provider:'Torrentio',infoHash:hash,fileIdx:2,quality:'1080p',codec:'HEVC',seeders:19,sizeBytes:1.5*1024**3,filename:'Film.mkv'});
    expect(stremioResults({streams:[null,{externalUrl:'https://example.com/setup'},{url:'javascript:alert(1)'},{infoHash:'bad'},{url:'https://example.com/video.mp4'}]},'Comet').streams).toEqual([expect.objectContaining({url:'https://example.com/video.mp4',provider:'Comet'})]);
  });
  it('uses exact movie and episode paths and maps anime to series',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify(payload)));
    await searchStremioSource('torrentio','movie','tt1254207',fetch);
    expect(fetch.mock.calls[0][0].href).toBe('https://torrentio.strem.fun/stream/movie/tt1254207.json');
    await searchStremioSource('torrentio','anime','kitsu:1:2',fetch);
    expect(fetch.mock.calls[1][0].pathname).toBe('/stream/series/kitsu%3A1%3A2.json');
    await expect(searchStremioSource('comet','series','tt123',fetch)).rejects.toThrow('specific episode');
  });
  it('uses configured manifests without exposing keys in failures',async()=>{
    vi.stubEnv('HASIMIO_COMET_MANIFEST_URL','https://comet.example/secret/manifest.json');
    const fetch=vi.fn(async()=>new Response('Forbidden',{status:403}));
    await expect(searchStremioSource('comet','series','tt123:1:2',fetch)).rejects.toThrow('HTTP 403');
    expect(fetch.mock.calls[0][0].pathname).toBe('/secret/stream/series/tt123%3A1%3A2.json');
    await expect(searchStremioSource('comet','movie','tt123',async()=>{throw new Error('secret');})).rejects.toThrow('Comet could not be reached.');
    await expect(searchStremioSource('comet','movie','tt123',async()=>new Response('{}'))).rejects.toThrow('invalid response');
  });
  it('only honors file indices pointing at playable videos',()=>{
    const files=[{name:'Show 01.mkv',length:20},{name:'setup.exe',length:100},{name:'Show 02.mkv',length:10}];
    expect(selectVideo(files,'tt123:1:2',2).selected).toBe(2);
    expect(selectVideo(files,undefined,1).selected).toBe(0);
    expect(selectVideo(files,undefined,-1).selected).toBe(0);
  });
  it('serves both manifests and keeps caches and failures separate',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify(payload)));
    const service=createMediaService({fetchImpl:fetch,titles:{close:async()=>{}},allowedOrigins:new Set()});
    async function request(url){let status,body;await service.handle({method:'GET',url,headers:{host:'127.0.0.1:11475'},socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},writeHead(code){status=code;},end(text){body=JSON.parse(text);}});return {status,body};}
    try{
      for(const key of ['torrentio','comet']){
        expect((await request(`/api/extensions/${key}/manifest.json`)).body.name).toBe(key==='comet'?'Comet':'Torrentio');
        const route=`/api/extensions/${key}/stream/movie/tt1254207.json`;
        expect((await request(route)).status).toBe(200);await request(route);
      }
      expect(fetch).toHaveBeenCalledTimes(2);
      fetch.mockImplementation(async()=>new Response('Forbidden',{status:403}));
      const route='/api/extensions/comet/stream/movie/tt123.json';
      expect((await request(route)).status).toBe(502);
      fetch.mockImplementation(async()=>new Response('{"streams":[]}'));
      expect((await request(route)).body).toEqual({streams:[]});
    }finally{await service.close();}
  });
});
