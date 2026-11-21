// End-to-end check for debrid playback on the PC: an MKV with AC3 sound (which
// the desktop player cannot decode) comes from a stand-in debrid service
// through a Torrentio resolve link, and Hasimio Engine serves it with AAC audio.
// Engine data goes to a temporary folder, never the installed app's cache.
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {promisify} from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const run=promisify(execFile);
const folder=await mkdtemp(path.join(os.tmpdir(),'hasimio-debrid-smoke-'));
process.env.HASIMIO_CACHE_DIR=path.join(folder,'cache');
const {createMediaService}=await import('../server/service.mjs');

const key='SMOKEKEY1234567890';
const link=`https://torrentio.strem.fun/resolve/realdebrid/${key}/${'d'.repeat(40)}/null/0/Smoke.Test.1080p.AC3.mkv`;
const cdn='https://cdn.debrid.example/dl/smoke/Smoke.Test.1080p.AC3.mkv';
let server,service;
try{
  const fixture=path.join(folder,'fixture.mkv');
  await run(ffmpegPath,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','6','-map','0:v','-map','1:a','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-g','24','-c:a','ac3','-ac','2','-metadata:s:a:0','language=eng',fixture],{windowsHide:true});
  const video=await readFile(fixture);
  let resolves=0;
  // The stand-in debrid service: Torrentio's link redirects, the file answers byte ranges.
  const fetchImpl=async(input,init={})=>{
    const url=String(input);
    if(url===link){resolves++;return new Response(null,{status:302,headers:{location:cdn}});}
    if(url!==cdn)return new Response('Not found',{status:404});
    const match=/^bytes=(\d+)-(\d*)$/.exec(init.headers?.Range??'');assert.ok(match,'The engine must always ask for a byte range.');
    const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),video.length-1):video.length-1;
    return new Response(video.subarray(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${video.length}`}});
  };
  service=createMediaService({fetchImpl,titles:{close:async()=>{}},allowedOrigins:new Set(),pieceCache:0});
  server=http.createServer((req,res)=>void service.handle(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const api=async(route,init)=>{const response=await fetch(base+route,init);const body=await response.json();assert.ok(response.ok,`${route}: ${body.error}`);return body;};
  const post=(route,body)=>api(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  async function until(id,done,what){for(let tries=0;tries<300;tries++){const status=await api('/api/torrents/'+id);if(status.state==='error')throw new Error(status.error);if(done(status))return status;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(what+' took too long.');}

  const started=await post('/api/torrents',{url:link,filename:'Smoke.Test.1080p.AC3.mkv',videoId:'tt0000001'});
  const ready=await until(started.id,status=>status.state==='ready','Opening the debrid link');
  assert.equal(ready.files[0].length,video.length);
  console.log('PASS: the debrid link opened as a one-file session through the torrent routes.');

  const tracks=await api(`/api/torrents/${started.id}/audio-tracks`);
  assert.deepEqual(tracks.audioTracks.map(track=>[track.language,track.codec.split(' ')[0]]),[['eng','ac3']]);
  assert.ok(Math.abs(tracks.duration-6)<0.5,'The probe must read the file duration: '+tracks.duration);
  console.log('PASS: FFmpeg read the file over the engine route and found the AC3 track.');

  await post(`/api/torrents/${started.id}/audio`,{track:0,start:0});
  const converted=await until(started.id,status=>status.audio?.state==='ready','Audio conversion');
  const decoded=await run(ffmpegPath,['-hide_banner','-i',base+converted.audio.mediaUrl,'-t','2','-f','null','-'],{windowsHide:true});
  assert.match(decoded.stderr,/Audio: aac/);assert.match(decoded.stderr,/Video: h264/);
  console.log('PASS: the AC3 sound plays as AAC, with the H.264 picture copied.');

  // Continue watching starts the conversion partway in, which reads from the middle of the debrid file.
  await post(`/api/torrents/${started.id}/audio`,{track:0,start:3});
  const resumed=await until(started.id,status=>status.audio?.state==='ready'&&status.audio.start===3,'Resuming audio conversion');
  assert.ok(resumed.audio.offset<=3&&resumed.audio.offset>=1.5,'Conversion must start at the keyframe before 3s: '+resumed.audio.offset);
  const tail=await run(ffmpegPath,['-hide_banner','-i',base+resumed.audio.mediaUrl,'-f','null','-'],{windowsHide:true});
  assert.match(tail.stderr,/Audio: aac/);
  const time=/time=(\d+):(\d+):(\d+\.\d+)/g;let last;for(const match of tail.stderr.matchAll(time))last=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
  assert.ok(last>2&&last<4.6,'A resumed conversion holds only the rest of the file: '+last);
  console.log('PASS: resuming at 3s converts from the nearest keyframe through the rest of the debrid file.');

  assert.equal(resolves,1,'The Torrentio link must be resolved once, not on every range request.');
  assert.ok(!JSON.stringify(converted).includes(key),'Session status must not carry the debrid key.');
  console.log('PASS: Torrentio was asked once, and the key stayed out of the session status.');
  await api('/api/torrents/'+started.id,{method:'DELETE'});
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await service?.close();
  await rm(folder,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
