import {describe,it,expect,vi} from 'vitest';
import {searchYts,ytsResults,ytsManifest,YTS_API} from './yts.mjs';
import {createMediaService} from './service.mjs';

const hash='a'.repeat(40);
const torrent={hash,quality:'1080p',type:'bluray',video_codec:'x264',seeds:12,size_bytes:1073741824};
const movie={imdb_code:'tt123',title:'Film',year:2020,torrents:[torrent]};
const payload=movies=>({status:'ok',data:{movie_count:movies.length,movies}});
describe('YTS movie sources',()=>{
  it('only accepts the exact IMDb movie and valid unique hashes, with quality and codec details',()=>{
    const streams=ytsResults(payload([movie,{...movie,imdb_code:'tt999'},
      {...movie,torrents:[torrent,{...torrent,hash:'b'.repeat(40),quality:'2160p',video_codec:'x265',seeds:30},{...torrent,hash:'invalid'}]}]),'tt123');
    expect(streams).toHaveLength(2);
    expect(streams[0]).toMatchObject({provider:'YTS',quality:'4K',codec:'HEVC',seeders:30,sizeBytes:1073741824,infoHash:'b'.repeat(40)});
    expect(streams[1].title).toContain('1.0 GB');expect(streams[1].codec).toBe('H.264');
  });
  it('returns an empty result for absent movies, but rejects provider errors and malformed responses',()=>{
    expect(ytsResults({status:'ok',data:{movie_count:0}},'tt123')).toEqual([]);
    for(const invalid of [null,{}, {status:'error'}, {status:'ok',data:{movie_count:1}}, {status:'ok',data:{movie_count:1,movies:{}}}])expect(()=>ytsResults(invalid,'tt123')).toThrow('invalid response');
  });
  it('uses the fixed API with an exact IMDb query and never requests a supplied download URL',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify(payload([{...movie,torrents:[{...torrent,url:'https://untrusted.invalid/download'}]}]))));
    expect((await searchYts('movie','tt123',fetch)).streams).toHaveLength(1);
    const [url,options]=fetch.mock.calls[0];expect(url.origin+url.pathname).toBe(YTS_API);expect(url.searchParams.get('query_term')).toBe('tt123');expect(options.redirect).toBe('error');expect(fetch).toHaveBeenCalledTimes(1);
    await expect(searchYts('series','tt123:1:2',fetch)).rejects.toThrow('movies only');
    await expect(searchYts('movie','kitsu:1',fetch)).rejects.toThrow('movies only');expect(fetch).toHaveBeenCalledTimes(1);
    await expect(searchYts('movie','tt123',async()=>new Response('',{status:503}))).rejects.toThrow('HTTP 503');
  });
  it('serves the manifest and caches YTS separately from Pirate Bay, retrying failed searches',async()=>{
    let fail=true;
    const fetch=vi.fn(async url=>{
      if(url.hostname==='apibay.org')return new Response(JSON.stringify([{info_hash:'c'.repeat(40),name:'Film.1080p',category:201,imdb:'tt123',seeders:5}]));
      if(fail){fail=false;return new Response('',{status:503});}
      return new Response(JSON.stringify(payload([movie])));
    });
    const service=createMediaService({fetchImpl:fetch,allowedOrigins:new Set(),titles:{close:async()=>{},title:async()=>({name:'Film'})}});
    async function request(url){let status,body;await service.handle({method:'GET',url,headers:{host:'127.0.0.1:11475'},socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},writeHead(code){status=code;},end(text){body=JSON.parse(text);}});return {status,body};}
    try{
      expect((await request('/api/extensions/yts/manifest.json')).body).toEqual(ytsManifest);
      const route='/api/extensions/yts/stream/movie/tt123.json';
      expect((await request(route)).status).toBe(502);
      expect((await request(route)).body.streams[0].provider).toBe('YTS');
      await request(route);expect(fetch).toHaveBeenCalledTimes(2);
      expect((await request('/api/extensions/piratebay/stream/movie/tt123.json')).body.streams[0].provider).toBe('The Pirate Bay');
      expect(fetch).toHaveBeenCalledTimes(3);
    }finally{await service.close();}
  });
});
