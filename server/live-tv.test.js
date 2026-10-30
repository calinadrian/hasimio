import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createLiveTv,decodeCoolEtvStream} from './live-tv.mjs';
const origin='https://saruman1.tharen001.cfd';
const embed=origin+'/000/cartun.html',stream=origin+'/cartun/live.m3u8';
const page='<iframe data-src="'+[...embed].map(char=>'&#'+char.charCodeAt(0)+';').join('')+'"></iframe>';
function fixture(overrides={}){
  const responses={
    'https://www.cool-etv.net/ch/cartoon.htm':page,
    'https://www.cool-etv.net/ch/cartoon-s2.htm':page,
    [embed]:'<script>var file="'+stream+'";</script>',
    [stream]:'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvariant.htm',
    [origin+'/cartun/variant.htm']:'#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:8,\nsegment.html',
    [origin+'/cartun/key.bin']:new Uint8Array(16),
    [origin+'/cartun/segment.html']:new Uint8Array([0x47,0x40,0,0]),
    ...overrides,
  };
  const fetchImpl=vi.fn(async url=>{
    if(!(url in responses))throw Error('Unexpected upstream URL: '+url);
    return responses[url] instanceof Response?responses[url]:new Response(responses[url]);
  });
  return {fetchImpl,tv:createLiveTv({fetchImpl})};
}
const assetName=body=>body.match(/asset\/([a-f0-9]{32})/)[1];
describe('video-only Live TV',()=>{
  it.each([
    ['a1','main','an1.htm','https://canale-tv.net/channel-v2/a1.html','https://alpha1.yozefina.cfd/ah1/usergenx304Jtlrnd.m3u8'],
    ['a1','alternative','an1-s2.htm','https://canale-tv.net/channel/a1.html','https://alpha1.yozefina.cfd/ah1/usergenx304Jtlrnd.m3u8'],
    ['tlc','main','tlc-s1.htm','https://atlantida1.aquax001.shop/000/t1c.html','https://atlantida1.aquax001.shop/telece/usergendc8sxt317rnd.m3u8'],
  ])('decodes and proxies %s %s without executing the player',async(channel,id,pageName,player,video)=>{
    const encoded=readFileSync(new URL('./fixtures/cool-etv-'+channel+'.txt',import.meta.url),'utf8');
    expect(decodeCoolEtvStream(encoded,channel)).toBe(video);
    const {tv,fetchImpl}=fixture({
      ['https://www.cool-etv.net/ch/'+pageName]:'<iframe data-src="'+player+'"></iframe>',
      [player]:encoded,
      [video]:'#EXTM3U\n#EXTINF:8,\nsegment.ts',
      [new URL('segment.ts',video).href]:new Uint8Array([0x47,0x40,0,0]),
    });
    const master=await tv.resource(channel,id,'index.m3u8');
    expect(master.body).toContain('/api/live-tv/'+channel+'/'+id+'/asset/');
    const key=assetName(master.body);
    await expect(tv.resource('cartoon-network',id,key)).rejects.toMatchObject({status:404});
    expect((await tv.resource(channel,id,key)).type).toBe('video/mp2t');
    expect(fetchImpl.mock.calls[1][1].headers.Referer).toBe('https://www.cool-etv.net/ch/'+pageName);
  });
  it('keeps channel caches separate and rejects unsupported channel/server pairs',async()=>{
    const {tv,fetchImpl}=fixture();
    await tv.resolve('cartoon-network','main');
    await expect(tv.resolve('tlc','alternative')).rejects.toMatchObject({status:404});
    await expect(tv.resolve('toString','main')).rejects.toMatchObject({status:404});
    await expect(tv.resolve('a1','main')).rejects.toThrow('Unexpected upstream URL');
    expect(fetchImpl.mock.calls.at(-1)[0]).toBe('https://www.cool-etv.net/ch/an1.htm');
  });
  it('resolves only the supplied server pages and caches source discovery',async()=>{
    const {tv,fetchImpl}=fixture();
    expect(await tv.resolve('cartoon-network','main')).toEqual({url:stream,referer:embed});
    await tv.resolve('cartoon-network','main');expect(fetchImpl).toHaveBeenCalledTimes(2);
    await tv.resolve('cartoon-network','alternative');expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({redirect:'manual',headers:{Referer:'https://www.cool-etv.net/ch/cartoon.htm'}});
  });
  it('rewrites nested playlists, keys and video segments to registered local routes',async()=>{
    const {tv}=fixture();
    const master=await tv.resource('cartoon-network','main','index.m3u8');
    expect(master.type).toBe('application/vnd.apple.mpegurl');
    expect(master.body).not.toContain(origin);
    const media=await tv.resource('cartoon-network','main',assetName(master.body));
    const keys=[...media.body.matchAll(/asset\/([a-f0-9]{32})/g)].map(match=>match[1]);
    expect(keys).toHaveLength(2);
    expect((await tv.resource('cartoon-network','main',keys[0])).body.length).toBe(16);
    expect(await tv.resource('cartoon-network','main',keys[1])).toEqual({body:Buffer.from([0x47,0x40,0,0]),type:'video/mp2t'});
  });
  it('rejects arbitrary servers, unknown assets and playlist URLs outside the channel host',async()=>{
    const {tv,fetchImpl}=fixture({[stream]:'#EXTM3U\nhttp://127.0.0.1/private'});
    await expect(tv.resolve('cartoon-network','other')).rejects.toMatchObject({status:404});
    await expect(tv.resource('cartoon-network','main','a'.repeat(32))).rejects.toMatchObject({status:404});
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(tv.resource('cartoon-network','main','index.m3u8')).rejects.toThrow('unsupported video host');
    expect(fetchImpl.mock.calls.every(([url])=>!url.includes('127.0.0.1'))).toBe(true);
  });
  it('does not follow provider redirects or serve webpages as video',async()=>{
    const {tv}=fixture({[embed]:new Response('',{status:301,headers:{Location:'https://www.google.com/'}})});
    await expect(tv.resolve('cartoon-network','main')).rejects.toThrow('unavailable');
    const other=fixture({[stream]:'<html>advertisement</html>'});
    await expect(other.tv.resource('cartoon-network','main','index.m3u8')).rejects.toThrow('webpage instead of video');
  });
  it('never executes provider scripts and rejects unsupported player data',()=>{
    expect(decodeCoolEtvStream('<script>throw Error("must not execute");var file="'+stream+'";</script>')).toBe(stream);
    expect(()=>decodeCoolEtvStream('<script>while(true){}</script>')).toThrow('changed its player');
  });
});
