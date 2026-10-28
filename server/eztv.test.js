import {describe,it,expect,vi} from 'vitest';
import {createEztvSearch,eztvResults,eztvManifest,EZTV_API} from './eztv.mjs';
import {createMediaService} from './service.mjs';
const hash='a'.repeat(40),video={imdb:'tt0123',season:1,episode:2};
const row={hash,title:'Show S01E02 1080p WEB x264',filename:'Show.S01E02.1080p.mkv',imdb_id:'123',season:'1',episode:'2',seeds:10,size_bytes:'1073741824'};
const payload=(torrents,total=torrents.length,page=1)=>({torrents,torrents_count:total,page,limit:100});
describe('EZTV episode sources',()=>{
  it('treats EZTV’s omitted torrents field on an unknown show as an empty result',async()=>{
    const search=createEztvSearch({fetchImpl:async()=>new Response(JSON.stringify({torrents_count:0,page:1,limit:100}))});
    expect(await search('series','tt0123:1:2')).toEqual({streams:[]});
  });
  it('matches exact IMDb, season and episode; rejects invalid files and ranks unique hashes',()=>{
    const result=eztvResults([row,{...row,seeds:20},{...row,hash:'b'.repeat(40),title:'Show S01E02 2160p x265',seeds:30},
      {...row,hash:'c'.repeat(40),imdb_id:'999'},{...row,hash:'d'.repeat(40),episode:'3'},
      {...row,hash:'e'.repeat(40),season:'2'},{...row,hash:'f'.repeat(40),filename:'bad.exe'},
      {...row,hash:'invalid'},{...row,season:null}],video);
    expect(result).toHaveLength(2);expect(result[0]).toMatchObject({provider:'EZTV',quality:'4K',codec:'HEVC',seeders:30});
    expect(result[1]).toMatchObject({seeders:20,sizeBytes:1073741824});expect(result[1].title).toContain('1.0 GB');
  });
  it('reads later pages for older episodes and reuses the show cache when switching episodes',async()=>{
    let clock=100;const urls=[];
    const fetch=vi.fn(async url=>{urls.push(url);return new Response(JSON.stringify(url.searchParams.get('page')==='1'?payload(Array.from({length:100},()=>({...row,season:'9'})),101):payload([row],101,2)));});
    const search=createEztvSearch({fetchImpl:fetch,now:()=>clock});
    expect((await search('series','tt0123:1:2')).streams).toHaveLength(1);
    expect((await search('series','tt0123:1:3')).streams).toEqual([]);expect(fetch).toHaveBeenCalledTimes(2);
    expect(urls.every(url=>url.origin+url.pathname===EZTV_API&&url.searchParams.get('imdb_id')==='123')).toBe(true);
    clock+=5*60*1000;await search('series','tt0123:1:2');expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('shares in-flight searches and retries failures without fetching download URLs',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockImplementation(async()=>new Response(JSON.stringify(payload([{...row,magnet_url:'https://untrusted.invalid'}]))));
    const search=createEztvSearch({fetchImpl:fetch});
    await expect(search('series','tt0123:1:2')).rejects.toThrow('HTTP 503');
    const results=await Promise.all([search('series','tt0123:1:2'),search('series','tt0123:1:2')]);
    expect(results.every(r=>r.streams.length===1)).toBe(true);expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1]).toMatchObject({redirect:'error',credentials:'omit'});
  });
  it('rejects unsupported IDs and malformed responses rather than caching empty results',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify({torrents:'bad',torrents_count:1})));
    const search=createEztvSearch({fetchImpl:fetch});
    for(const [type,id] of [['movie','tt0123'],['series','tt0123'],['anime','kitsu:1:2'],['series','tt0123:1:Infinity']])await expect(search(type,id)).rejects.toThrow('specific IMDb series episode');
    expect(fetch).not.toHaveBeenCalled();
    await expect(search('series','tt0123:1:2')).rejects.toThrow('invalid response');
    await expect(search('series','tt0123:1:2')).rejects.toThrow('invalid response');expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('serves the local extension route and keeps provider caches separate',async()=>{
    const fetch=vi.fn(async url=>new Response(JSON.stringify(url.hostname==='eztvx.to'?payload([row]):[{info_hash:'b'.repeat(40),name:'Show S01E02',category:205,imdb:'tt0123',seeders:1}])));
    const service=createMediaService({fetchImpl:fetch,titles:{close:async()=>{},title:async()=>({name:'Show'})},allowedOrigins:new Set()});
    async function request(url){let status,body;await service.handle({method:'GET',url,headers:{host:'127.0.0.1:11475'},socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},writeHead(code){status=code;},end(text){body=JSON.parse(text);}});return {status,body};}
    try{
      expect((await request('/api/extensions/eztv/manifest.json')).body).toEqual(eztvManifest);
      expect((await request('/api/extensions/eztv/stream/series/tt0123%3A1%3A2.json')).body.streams[0].provider).toBe('EZTV');
      expect((await request('/api/extensions/piratebay/stream/series/tt0123%3A1%3A2.json')).body.streams[0].provider).toBe('The Pirate Bay');
      expect((await request('/api/extensions/eztv/stream/series/tt0123%3A1%3A2.json')).status).toBe(200);expect(fetch).toHaveBeenCalledTimes(2);
    }finally{await service.close();}
  });
});
