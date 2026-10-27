import {describe,it,expect,vi} from 'vitest';
import {torrentResults,parseVideoId,searchPirateBay} from './piratebay.mjs';
import {byteRange,selectVideo,localRequest,parseOrigins,corsHeaders,preflightHeaders} from './torrent-utils.mjs';
import {cacheRoot} from './paths.mjs';
import {engineOptions,ENGINE_PORT} from './engine.mjs';
describe('Pirate Bay source matching',()=>{
  const hash='a'.repeat(40);
  it('rejects non-video, malformed, mismatched and executable results, ranking unique hashes by seeders',()=>{
    const base={info_hash:hash,name:'Film.1080p',category:'201',imdb:'tt123',size:'1073741824',seeders:'12'};
    const result=torrentResults([base,base,{...base,info_hash:'b'.repeat(40),seeders:'30'},{...base,info_hash:'c'.repeat(40),imdb:'tt999'},{...base,info_hash:'d'.repeat(40),category:'301'},{...base,info_hash:'e'.repeat(40),name:'film.exe'},{...base,info_hash:'not-a-hash'}],'tt123');
    expect(result).toHaveLength(2);expect(result[0].infoHash).toBe('b'.repeat(40));expect(result[0].title).toContain('30 seeders');expect(result[0].title).toContain('1.0 GB');
  });
  it('requires a specific episode for series searches',()=>{expect(()=>parseVideoId('series','tt123')).toThrow();expect(parseVideoId('series','tt123:1:2')).toEqual({imdb:'tt123',season:1,episode:2});});
  it('uses IMDb matches directly for movies without an unnecessary metadata lookup',async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify([{info_hash:hash,name:'Film.720p',category:'201',imdb:'tt123',seeders:'5',size:'2000'}])));
    expect((await searchPirateBay('movie','tt123',fetch)).streams).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(1);expect(String(fetch.mock.calls[0][0])).toContain('q=tt123');
  });
  it('surfaces upstream failures instead of pretending there are no sources',async()=>{await expect(searchPirateBay('movie','tt123',vi.fn().mockResolvedValue(new Response('',{status:503})))).rejects.toThrow('HTTP 503');});
});
describe('torrent video selection',()=>{
  const files=[{name:'sample.mp4',length:1000},{name:'Show.S01E01.mkv',length:300},{name:'Show.S01E02.mp4',length:200},{name:'readme.exe',length:100}];
  it('selects the requested episode rather than the biggest unrelated file',()=>{expect(selectVideo(files,'tt123:1:2').selected).toBe(2);});
  it('asks for a file when an episode cannot be matched inside a season pack',()=>{const result=selectVideo(files,'tt123:1:3');expect(result.selected).toBeUndefined();expect(result.files).toHaveLength(2);});
  it('does not select executable or sample files',()=>{expect(selectVideo(files).selected).toBe(1);expect(selectVideo([{name:'installer.exe',length:1000}]).selected).toBeUndefined();});
});
describe('HTTP video ranges and localhost boundary',()=>{
  it('allows same-origin LAN devices on this server address, but rejects foreign origins and public clients',()=>{const hosts=new Set(['192.168.100.10']);const request={headers:{host:'192.168.100.10:5176',origin:'http://192.168.100.10:5176'},socket:{remoteAddress:'::ffff:192.168.100.20'}};expect(localRequest(request,hosts)).toBe(true);expect(localRequest({...request,headers:{...request.headers,origin:'https://evil.example'}},hosts)).toBe(false);expect(localRequest({...request,socket:{remoteAddress:'8.8.8.8'}},hosts)).toBe(false);expect(localRequest(request,new Set(['192.168.100.11']))).toBe(false);});
  it('serves seeks, suffixes and full-file reads with correct byte bounds',()=>{expect(byteRange('bytes=20-39',100)).toEqual({start:20,end:39,partial:true});expect(byteRange('bytes=-10',100)).toEqual({start:90,end:99,partial:true});expect(byteRange(undefined,100)).toEqual({start:0,end:99,partial:false});expect(byteRange('bytes=100-',100)).toBeNull();expect(byteRange('bytes=1-2,4-5',100)).toBeNull();});
  it('rejects cross-origin websites and non-local hostnames',()=>{expect(localRequest({headers:{host:'127.0.0.1:5176',origin:'http://127.0.0.1:5176'}})).toBe(true);expect(localRequest({headers:{host:'127.0.0.1:5176',origin:'https://example.com'}})).toBe(false);expect(localRequest({headers:{host:'evil.example:5176'}})).toBe(false);});
});
describe('hosted UI origins',()=>{
  const site='https://hasimio.example';const origins=parseOrigins(site);const hosts=new Set(['127.0.0.1']);
  const api=(headers,extra={})=>({method:'GET',url:'/api/streaming/health',headers:{host:'127.0.0.1:11475',...headers},socket:{remoteAddress:'127.0.0.1'},...extra});
  it('accepts only exact scheme://host[:port] origins',()=>{expect([...parseOrigins(' https://a.example , http://b.example:8080/ ')]).toEqual(['https://a.example','http://b.example:8080']);expect(()=>parseOrigins('https://a.example/app')).toThrow();expect(()=>parseOrigins('ftp://a.example')).toThrow();expect(()=>parseOrigins('a.example')).toThrow();});
  it('lets the allowed site call the engine, but not other sites or lookalikes',()=>{
    expect(localRequest(api({origin:site,'sec-fetch-site':'cross-site'}),hosts,origins)).toBe(true);
    expect(localRequest(api({origin:'https://evil.example','sec-fetch-site':'cross-site'}),hosts,origins)).toBe(false);
    expect(localRequest(api({origin:'http://hasimio.example','sec-fetch-site':'cross-site'}),hosts,origins)).toBe(false);
    expect(localRequest(api({origin:site,'sec-fetch-site':'cross-site'}),hosts)).toBe(false);
  });
  it('keeps the DNS-rebinding and public-client checks for the allowed site',()=>{expect(localRequest(api({origin:site,host:'hasimio.example'}),hosts,origins)).toBe(false);expect(localRequest(api({origin:site},{socket:{remoteAddress:'8.8.8.8'}}),hosts,origins)).toBe(false);});
  it('allows Origin-less cross-site media reads only for session-scoped files',()=>{
    const id='a'.repeat(36);const media=url=>api({'sec-fetch-site':'cross-site'},{url});
    for(const url of [`/api/torrents/${id}/files/0`,`/api/torrents/${id}/audio/main.m3u8?track=0`,`/api/torrents/${id}/audio/segment-000001.m4s`,`/api/torrents/${id}/subtitles/2.vtt?file=0`])expect(localRequest(media(url),hosts,origins)).toBe(true);
    for(const url of ['/api/streaming/health','/api/extensions/piratebay/stream/movie/tt1.json',`/api/torrents/${id}`,'/api/torrents'])expect(localRequest(media(url),hosts,origins)).toBe(false);
    expect(localRequest({...media(`/api/torrents/${id}/files/0`),method:'POST'},hosts,origins)).toBe(false);
    expect(localRequest(media(`/api/torrents/${id}/files/0`),hosts)).toBe(false);
  });
  it('sends CORS and private-network headers only to the allowed site',()=>{
    expect(corsHeaders(api({origin:site}),origins)['Access-Control-Allow-Origin']).toBe(site);
    expect(corsHeaders(api({origin:'https://evil.example'}),origins)['Access-Control-Allow-Origin']).toBeUndefined();
    const preflight=preflightHeaders(api({origin:site,'access-control-request-private-network':'true'}),origins);
    expect(preflight['Access-Control-Allow-Private-Network']).toBe('true');expect(preflight['Access-Control-Allow-Methods']).toContain('PATCH');expect(preflight['Access-Control-Allow-Headers']).toContain('Range');
    expect(preflightHeaders(api({origin:'https://evil.example'}),origins)).toBeUndefined();
  });
});
describe('Hasimio Engine options and cache folder',()=>{
  it('reports its API version and package version in the health check',async()=>{
    const {createMediaService}=await import('./service.mjs');const {ENGINE_API_VERSION}=await import('../shared/engine-api.mjs');const service=createMediaService({allowedOrigins:new Set()});
    let status,body;const res={setHeader(){},writeHead(code){status=code;},end(text){body=JSON.parse(text);}};
    await service.handle({method:'GET',url:'/api/streaming/health',headers:{host:'127.0.0.1:11475'},socket:{remoteAddress:'127.0.0.1'}},res);await service.close();
    expect(status).toBe(200);expect(body.apiVersion).toBe(ENGINE_API_VERSION);expect(body.engineVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
  it('binds loopback on 11475 by default, with LAN, port and site options',()=>{
    expect(engineOptions([],{})).toEqual({port:ENGINE_PORT,host:'127.0.0.1',allowedOrigins:new Set()});
    const options=engineOptions(['--lan','--port','9000','--allow-origin','https://a.example'],{HASIMIO_ALLOWED_ORIGINS:'https://b.example'});
    expect(options.host).toBe('0.0.0.0');expect(options.port).toBe(9000);expect([...options.allowedOrigins].sort()).toEqual(['https://a.example','https://b.example']);
    expect(()=>engineOptions(['--port','0'],{})).toThrow();expect(()=>engineOptions(['--bogus'],{})).toThrow();
  });
  it('reads engine.json, with command-line flags taking precedence and sites combining',()=>{
    const config={allowedOrigins:['https://c.example'],port:12000,lan:true};const read=file=>{expect(file).toBe('engine.json');return config;};
    const options=engineOptions(['--config','engine.json','--port','13000','--allow-origin','https://a.example'],{HASIMIO_ALLOWED_ORIGINS:'https://b.example'},read);
    expect(options.port).toBe(13000);expect(options.host).toBe('0.0.0.0');expect([...options.allowedOrigins].sort()).toEqual(['https://a.example','https://b.example','https://c.example']);
    expect(engineOptions(['--config','engine.json'],{},read).port).toBe(12000);
    expect(()=>engineOptions(['--config','engine.json'],{},()=>{throw new Error('ENOENT');})).toThrow('Could not read engine.json');
    expect(()=>engineOptions(['--config','engine.json'],{},()=>({allowedOrigins:'https://a.example'}))).toThrow('must be a list');
    expect(()=>engineOptions(['--config','engine.json'],{},()=>({allowedOrigins:['https://a.example/path']}))).toThrow();
    expect(()=>engineOptions(['--config'],{})).toThrow('needs a file path');
  });
  it('keeps temporary data in the per-user cache folder',()=>{
    expect(cacheRoot({LOCALAPPDATA:'C:\\Users\\me\\AppData\\Local'},'win32')).toMatch(/AppData[\\/]Local[\\/]Hasimio[\\/]cache$/);
    expect(cacheRoot({XDG_CACHE_HOME:'/home/me/.cache'},'linux')).toMatch(/[\\/]home[\\/]me[\\/]\.cache[\\/]hasimio$/);
    expect(cacheRoot({HASIMIO_CACHE_DIR:'/tmp/h'},'win32')).toMatch(/[\\/]tmp[\\/]h$/);
  });
});

import {parseAudioTracks,parseSubtitleTracks,audioArguments,parseMediaDuration} from './compatible-audio.mjs';
describe('embedded audio discovery',()=>{
  it('keeps language, commentary titles and defaults without borrowing video metadata',()=>{const tracks=parseAudioTracks('  Stream #0:0: Video: h264\n    Metadata:\n      title : Video title\n  Stream #0:1(eng): Audio: aac, 48000 Hz, stereo (default)\n    Metadata:\n      title : English dub\n  Stream #0:2[0x3](jpn): Audio: ac3, stereo\n    Metadata:\n      title : Commentary\n  Stream #0:3: Subtitle: subrip\n    Metadata:\n      title : Subtitles');expect(tracks).toEqual([{index:0,language:'eng',codec:'aac',default:true,title:'English dub'},{index:1,language:'jpn',codec:'ac3',default:false,title:'Commentary'}]);});
  it('preserves untagged tracks and silent video',()=>{expect(parseAudioTracks('  Stream #0:1: Audio: aac, stereo')[0].language).toBe('und');expect(parseAudioTracks('  Stream #0:0: Video: h264')).toEqual([]);});
  it('rejects invalid mapping indices',()=>{expect(()=>audioArguments('input','folder',false,-1)).toThrow('Invalid audio track');});
});

describe('subtitle formats',()=>{it('distinguishes text subtitles from image subtitles',()=>{expect(parseSubtitleTracks('  Stream #0:3(eng): Subtitle: subrip\n  Stream #0:4(jpn): Subtitle: hdmv_pgs_subtitle')).toMatchObject([{index:0,supported:true,language:'eng'},{index:1,supported:false,language:'jpn'}]);});});

describe('source movie duration',()=>{
  it('reads the complete duration without relying on the growing playlist',()=>{
    expect(parseMediaDuration('  Duration: 02:03:04.56, start: 0.000000')).toBe(7384.56);
    expect(parseMediaDuration('  Duration: N/A, start: 0')).toBeUndefined();
  });
});
