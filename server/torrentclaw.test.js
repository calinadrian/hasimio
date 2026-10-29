import {describe,it,expect,vi} from 'vitest';
import {torrentClawManifest,torrentClawResults,searchTorrentClaw,torrentClawMeta,catalogTorrentClaw,metadataTorrentClaw} from './torrentclaw.mjs';
import {createMediaService} from './service.mjs';
const hash='a'.repeat(40),video={imdb:'tt123',season:1,episode:2};
const release=(extra={})=>({infoHash:hash,rawTitle:'Show.S01E02.1080p.WEB-DL.x265',season:1,episode:2,seeders:15,sizeBytes:'1073741824',...extra});
const payload=(torrents=[release()],extra={})=>({results:[{imdbId:'tt123',contentType:'show',torrents,...extra}]});
describe('TorrentClaw',()=>{
  it('discovers and searches shows independently of the IMDb index and paginates unfiltered API rows',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify({total:101,results:[{title:'Temptation Island RO',contentType:'show',tmdbId:'62767',year:2015,torrents:[]},{title:'No usable ID',contentType:'show'}]})));
    const result=await catalogTorrentClaw('series','discover',{search:'Temptation Island RO',skip:'50'},fetch);
    expect(result).toMatchObject({nextSkip:100,hasMore:true,metas:[{id:'tmdb:62767',name:'Temptation Island RO',type:'series',releaseInfo:'2015'}]});
    expect(Object.fromEntries(fetch.mock.calls[0][0].searchParams)).toEqual({q:'Temptation Island RO',type:'show',availability:'available',limit:'50',page:'2'});
    await catalogTorrentClaw('movie','discover',{},fetch);expect(fetch.mock.calls[1][0].searchParams.has('q')).toBe(false);
    await expect(catalogTorrentClaw('series','discover',{skip:'-1'},fetch)).rejects.toThrow('offset');
  });
  it('uses real episode metadata and known torrent episodes without inventing dates or count-only episodes',()=>{
    const meta=torrentClawMeta({imdbId:'tt123',title:'Show',contentType:'show',posterUrl:'javascript:alert(1)',torrents:[release(),release({season:2,episode:null,packEpisodes:[1,3]})],
      seasons:[{season:1,episodeCount:100,episodes:[{episode:2,name:'A real episode',airDate:'2025-06-03',stillUrl:'/still.jpg'}]},{season:3,episodeCount:20}]},'series');
    expect(meta.poster).toBeUndefined();expect(meta.videos).toHaveLength(3);
    expect(meta.videos[0]).toMatchObject({id:'tt123:1:2',title:'A real episode',released:'2025-06-03',thumbnail:'https://torrentclaw.com/still.jpg'});
    expect(meta.videos[1]).toMatchObject({season:2,episode:1,released:undefined});
  });
  it('opens and plays TMDB-only titles and retains saved TMDB IDs when IMDb becomes available',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify(payload(undefined,{tmdbId:'62767',title:'Show'}))));
    const {meta}=await metadataTorrentClaw('series','tmdb:62767',fetch);
    expect(meta.id).toBe('tmdb:62767');expect(meta.videos[0].id).toBe('tmdb:62767:1:2');
    expect(fetch.mock.calls[0][0].searchParams.get('include')).toBe('episodes');
    expect(fetch.mock.calls[0][0].searchParams.get('tmdbid')).toBe('62767');
    expect((await searchTorrentClaw('series','tmdb:62767:1:2',fetch)).streams).toHaveLength(1);
    await expect(metadataTorrentClaw('series','tmdb:999',fetch)).rejects.toThrow('not in TorrentClaw');
  });
  it('serves catalog and metadata routes with independent caching and encoded query text',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify(payload(undefined,{title:'Show',total:1}))));
    const service=createMediaService({fetchImpl:fetch,titles:{close:async()=>{}},allowedOrigins:new Set()});
    async function request(url){let body;await service.handle({method:'GET',url,headers:{host:'127.0.0.1:11475'},socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},writeHead(){},end(text){body=JSON.parse(text);}});return body;}
    try{
      const path='/api/extensions/torrentclaw/catalog/series/discover/search=Temptation%20Island%20RO.json';
      expect((await request(path)).metas[0].id).toBe('tt123');await request(path);
      expect(fetch.mock.calls[0][0].searchParams.get('q')).toBe('Temptation Island RO');
      const metadata='/api/extensions/torrentclaw/meta/series/tt123.json';
      expect((await request(metadata)).meta.videos[0].id).toBe('tt123:1:2');await request(metadata);
      expect(fetch).toHaveBeenCalledTimes(2);
    }finally{await service.close();}
  });
  it('maps the documented response without following supplied URLs and deduplicates hashes',()=>{
    const streams=torrentClawResults(payload([release({seeders:2}),release({infoHash:hash.toUpperCase(),magnetUrl:'https://invalid.example',torrentUrl:'https://invalid.example'})]),'series',video);
    expect(streams).toHaveLength(1);expect(streams[0]).toMatchObject({provider:'TorrentClaw',infoHash:hash,quality:'1080p',codec:'HEVC',seeders:15,sizeBytes:1024**3});
    expect(streams[0]).not.toHaveProperty('url');
  });
  it('rejects mismatched shows, episodes, packs, invalid hashes and unsafe labels',()=>{
    for(const change of [{season:2},{episode:3},{episode:null},{infoHash:'bad'},{rawTitle:'Show.S01E02.exe'},{rawTitle:null}]){
      expect(torrentClawResults(payload([release(change)]),'series',video)).toEqual([]);
    }
    for(const change of [{imdbId:'tt999'},{contentType:'movie'}])expect(torrentClawResults(payload(undefined,change),'series',video)).toEqual([]);
  });
  it('supports exact movies and sanitizes numeric fields',()=>{
    const data=payload([release({season:null,episode:null,seeders:-1,sizeBytes:'Infinity',rawTitle:'Movie 2020 2160p AV1'})],{contentType:'movie'});
    expect(torrentClawResults(data,'movie',{imdb:'tt123'})[0]).toMatchObject({quality:'4K',codec:'AV1',seeders:0,sizeBytes:0});
    expect(torrentClawResults(payload(undefined,{contentType:'movie'}),'movie',{imdb:'tt123'})).toEqual([]);
  });
  it('queries exact IMDb and episode filters with a bounded request',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify(payload())));
    expect((await searchTorrentClaw('series','tt123:1:2',fetch)).streams).toHaveLength(1);
    const [url,options]=fetch.mock.calls[0];expect(url.origin).toBe('https://torrentclaw.com');
    expect(Object.fromEntries(url.searchParams)).toEqual({imdbid:'tt123',type:'show',limit:'1',season:'1',episode:'2'});
    expect(options).toMatchObject({redirect:'error',credentials:'omit'});expect(options.signal).toBeInstanceOf(AbortSignal);expect(options.headers).toBeUndefined();
    await searchTorrentClaw('movie','tt123',fetch);expect(fetch.mock.calls[1][0].searchParams.has('episode')).toBe(false);
  });
  it('sends an optional API key as a bearer token and explains refused connections',async()=>{
    vi.stubEnv('HASIMIO_TORRENTCLAW_API_KEY',' secret ');
    try{
      const fetch=vi.fn(async()=>new Response(JSON.stringify(payload())));
      await searchTorrentClaw('series','tt123:1:2',fetch);
      expect(fetch.mock.calls[0][1].headers).toEqual({Authorization:'Bearer secret'});
      expect(fetch.mock.calls[0][0].searchParams.has('api_key')).toBe(false);
    }finally{vi.unstubAllEnvs();}
    await expect(searchTorrentClaw('movie','tt123',async()=>new Response('Forbidden',{status:403}))).rejects.toThrow('HASIMIO_TORRENTCLAW_API_KEY');
  });
  it('distinguishes empty responses from provider failures and rejects unsupported IDs before fetching',async()=>{
    expect(await searchTorrentClaw('movie','tt123',async()=>new Response('{"results":[]}'))).toEqual({streams:[]});
    await expect(searchTorrentClaw('movie','tt123',async()=>new Response('Forbidden',{status:403}))).rejects.toThrow('HTTP 403');
    expect(()=>torrentClawResults({},'movie',video)).toThrow('invalid response');
    const fetch=vi.fn();
    for(const [type,id] of [['anime','kitsu:1'],['series','tt123'],['movie','tt123:1:2']])await expect(searchTorrentClaw(type,id,fetch)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('resolves the bundled manual title by its short search name for title-based providers',async()=>{
    const fetch=vi.fn(async()=>new Response('[]'));
    const service=createMediaService({fetchImpl:fetch,titles:{close:async()=>{},title:async()=>{throw new Error('not indexed');}},allowedOrigins:new Set()});
    try{
      await service.handle({method:'GET',url:'/api/extensions/piratebay/stream/series/tt28504410%3A1%3A1.json',headers:{host:'127.0.0.1:11475'},socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},writeHead(){},end(){}});
      const searched=fetch.mock.calls.map(([url])=>decodeURIComponent(String(url)).replace(/\+/g,' ')).join('\n');
      expect(searched).toContain('Insula Iubirii');expect(searched).not.toContain('Temptation');
    }finally{await service.close();}
  });
  it('serves its manifest, caches success, and retries failed requests through the local service',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(new Response('Forbidden',{status:403})).mockImplementation(async()=>new Response(JSON.stringify(payload())));
    const service=createMediaService({fetchImpl:fetch,titles:{close:async()=>{}},allowedOrigins:new Set()});
    async function request(url){let body,status;await service.handle({method:'GET',url,headers:{host:'127.0.0.1:11475'},socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},writeHead(value){status=value;},end(text){body=JSON.parse(text);}});return {body,status};}
    try{
      expect((await request('/api/extensions/torrentclaw/manifest.json')).body).toEqual(torrentClawManifest);
      const url='/api/extensions/torrentclaw/stream/series/tt123%3A1%3A2.json';
      const refused=await request(url);expect(refused.status).toBe(502);expect(refused.body.error).toContain('HTTP 403');
      expect((await request(url)).body.streams[0].provider).toBe('TorrentClaw');await request(url);expect(fetch).toHaveBeenCalledTimes(2);
    }finally{await service.close();}
  });
});
