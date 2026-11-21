import {describe,expect,it} from 'vitest';
import http from 'node:http';
import {debridLink,privateHost,openRemoteFile} from './remote-file.mjs';
import {createMediaService} from './service.mjs';

const KEY='SECRETKEY1234567890';
const hash='a'.repeat(40);
const link=`https://torrentio.strem.fun/resolve/realdebrid/${KEY}/${hash}/null/0/Movie.2020.1080p.mkv`;
const cdn='https://cdn.debrid.example/d/XYZ/Movie.2020.1080p.mkv';
const pack=`https://torrentio.strem.fun/resolve/realdebrid/${KEY}/${hash}/null/0/pack`;
// A Matroska header first, so the engine's container check accepts it.
const video=Buffer.from(Array.from({length:6000},(_,index)=>index%251));video.writeUInt32BE(0x1a45dfa3,0);

/** A debrid service: Torrentio's link redirects once, the file answers byte ranges. */
function debrid({ranges=true,status=206,redirect=cdn,drop,from=link}={}){
  const calls=[];
  const fetchImpl=async(input,init={})=>{
    const url=String(input),range=init.headers?.Range;calls.push({url,range,redirect:init.redirect});
    if(url===from)return new Response(null,{status:302,headers:{location:redirect}});
    if(url!==redirect)return new Response('Not found',{status:404});
    if(status!==206)return new Response('Denied',{status});
    const match=/^bytes=(\d+)-(\d*)$/.exec(range??'');
    if(!ranges||!match)return new Response(video,{status:200,headers:{'content-length':String(video.length)}});
    const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),video.length-1):video.length-1;
    const part=video.subarray(start,end+1),headers={'content-range':`bytes ${start}-${end}/${video.length}`};
    if(drop&&drop.remaining>0&&start<drop.at&&end>drop.at){
      // The connection breaks partway: the reader has to carry on from there.
      drop.remaining--;
      let sent=false;
      return new Response(new ReadableStream({pull(controller){if(sent)controller.error(new Error('reset'));else{sent=true;controller.enqueue(new Uint8Array(part.subarray(0,drop.at-start)));}}}),{status:206,headers});
    }
    return new Response(part,{status:206,headers});
  };
  return {calls,fetchImpl};
}
async function collect(stream){const chunks=[];for await(const chunk of stream)chunks.push(chunk);return Buffer.concat(chunks);}

describe('debrid links in the engine',()=>{
  it('accepts only Torrentio resolve links for known services',()=>{
    expect(debridLink(link)?.href).toBe(link);
    expect(debridLink(link.replace('torrentio.strem.fun','evil.example'))).toBeUndefined();
    expect(debridLink(link.replace('/realdebrid/','/unknown/'))).toBeUndefined();
    expect(debridLink(link.replace('https://','https://user:pass@'))).toBeUndefined();
    expect(debridLink('https://torrentio.strem.fun/stream/movie/tt1.json')).toBeUndefined();
    expect(debridLink('not a url')).toBeUndefined();
  });
  it('refuses redirects to this PC or its network',()=>{
    for(const host of ['localhost','127.0.0.1','10.0.0.4','192.168.1.20','172.20.0.1','169.254.1.1','[::1]','[fd00::1]','[::ffff:127.0.0.1]'])expect(privateHost(host),host).toBe(true);
    for(const host of ['cdn.debrid.example','8.8.8.8','172.32.0.1','[2001:db8::1]'])expect(privateHost(host),host).toBe(false);
  });
  it('resolves the link once, then reads exact byte ranges from the debrid file',async()=>{
    const service=debrid();
    const file=await openRemoteFile(new URL(link),{fetchImpl:service.fetchImpl});
    expect(file).toMatchObject({name:'Movie.2020.1080p.mkv',length:video.length});
    expect(await collect(file.createReadStream({start:100,end:1099}))).toEqual(video.subarray(100,1100));
    expect(await collect(file.createReadStream())).toEqual(video);
    expect(service.calls.filter(call=>call.url===link)).toHaveLength(1);
    expect(service.calls.every(call=>call.redirect==='manual')).toBe(true);
  });
  it('carries on from where a dropped connection stopped',async()=>{
    const service=debrid({drop:{at:2500,remaining:2}});
    const file=await openRemoteFile(new URL(link),{fetchImpl:service.fetchImpl});
    expect(await collect(file.createReadStream({start:1000,end:4999}))).toEqual(video.subarray(1000,5000));
    expect(service.calls.filter(call=>call.url===cdn).map(call=>call.range)).toContain('bytes=2500-4999');
  });
  it('stops waiting on a stalled debrid service as soon as the reader is destroyed',async()=>{
    const service=debrid();let aborted=false,stall=false;
    const fetchImpl=(input,init)=>stall?new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>{aborted=true;reject(init.signal.reason);})):service.fetchImpl(input,init);
    const file=await openRemoteFile(new URL(link),{fetchImpl});stall=true;
    const stream=file.createReadStream({start:0,end:99});stream.on('error',()=>{});stream.resume();
    await new Promise(resolve=>setTimeout(resolve,20));
    const closed=new Promise(resolve=>stream.once('close',resolve));
    stream.destroy(new Error('No video data arrived.'));
    await Promise.race([closed,new Promise((_resolve,reject)=>setTimeout(()=>reject(new Error('The stalled read was not interrupted.')),500))]);
    expect(aborted).toBe(true);
  });
  it('fails clearly, without the key, when the file cannot be streamed',async()=>{
    const failures=[
      [debrid({ranges:false}),/does not allow seeking/],
      [debrid({status:403}),/did not hand over this file \(HTTP 403\)/],
      [debrid({redirect:'http://127.0.0.1:11475/api/'}),/will not fetch from/],
      [debrid({redirect:'http://cdn.debrid.example/plain.mkv'}),/will not fetch from/],
      [debrid({from:pack,redirect:'https://cdn.debrid.example/archive.rar'}),/not a video file/,pack],
      // Torrentio's explanatory clips are failures, not films.
      [debrid({redirect:'https://torrentio.strem.fun/videos/downloading_v3.mp4'}),/still downloading/],
      [debrid({redirect:'https://torrentio.strem.fun/videos/failed_access_v3.mp4'}),/Check the API key in Settings/],
      [debrid({redirect:'https://torrentio.strem.fun/videos/limits_exceeded_v2.mp4'}),/reached its limit/],
      [debrid({redirect:'https://torrentio.strem.fun/videos/failed_unexpected_v3.mp4'}),/could not provide this file/],
    ];
    for(const [service,message,from=link] of failures){
      const error=await openRemoteFile(new URL(from),{fetchImpl:service.fetchImpl,name:'notes.txt'}).then(()=>undefined,error=>error);
      expect(error?.message).toMatch(message);expect(error.message).not.toContain(KEY);
    }
  });
});

describe('the engine playing a debrid link',()=>{
  async function engine(fetchImpl){
    const service=createMediaService({fetchImpl,titles:{close:async()=>{}},allowedOrigins:new Set()});
    const server=http.createServer((req,res)=>void service.handle(req,res));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const call=async(path,init)=>{const response=await fetch(base+path,init);return {status:response.status,headers:response.headers,body:response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer())};};
    const start=input=>call('/api/torrents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    async function settled(id){for(let tries=0;tries<100;tries++){const {body}=await call('/api/torrents/'+id);if(body.state!=='buffering')return body;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Session did not settle.');}
    return {call,start,settled,close:async()=>{await new Promise(resolve=>server.close(resolve));await service.close();}};
  }
  it('serves the debrid file through the same routes as a torrent file',async()=>{
    const upstream=debrid(),local=await engine(upstream.fetchImpl);
    try{
      const started=await local.start({url:link,filename:'Movie.2020.1080p.mkv',videoId:'tt1'});
      expect(started.status).toBe(202);
      const ready=await local.settled(started.body.id);
      expect(ready).toMatchObject({state:'ready',selected:0,files:[{index:0,name:'Movie.2020.1080p.mkv',length:video.length}],mediaUrl:`/api/torrents/${started.body.id}/files/0`,numPeers:0});
      const part=await local.call(ready.mediaUrl,{headers:{Range:'bytes=100-1099'}});
      expect(part.status).toBe(206);expect(part.headers.get('content-range')).toBe(`bytes 100-1099/${video.length}`);expect(part.body).toEqual(video.subarray(100,1100));
      expect(JSON.stringify(ready)).not.toContain(KEY);
      expect(upstream.calls.filter(call=>call.url===link)).toHaveLength(1);
      expect((await local.call('/api/torrents/'+started.body.id,{method:'DELETE'})).body).toEqual({stopped:true});
    }finally{await local.close();}
  });
  it('turns away other addresses and reports debrid failures without the key',async()=>{
    const local=await engine(debrid({status:403}).fetchImpl);
    try{
      const refused=await local.start({url:'https://evil.example/resolve/realdebrid/'+KEY+'/x/null/0/a.mkv'});
      expect(refused.status).toBe(400);expect(refused.body.error).toMatch(/Only debrid links from Torrentio/);expect(refused.body.error).not.toContain(KEY);
      const started=await local.start({url:link});
      const failed=await local.settled(started.body.id);
      expect(failed.state).toBe('error');expect(failed.error).toMatch(/HTTP 403/);expect(failed.error).not.toContain(KEY);
    }finally{await local.close();}
  });
});
