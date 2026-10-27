// A real TCP torrent transfer of generated test bytes. No public torrents are downloaded.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,unlink,access,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import {audioRoot} from './compatible-audio.mjs';
import WebTorrent from 'webtorrent';
import {createMediaService} from './service.mjs';

const options={dht:false,tracker:false,lsd:false,natUpnp:false,natPmp:false,utp:false};
const seeder=new WebTorrent(options);
const downloader=new WebTorrent(options);const inspector=new WebTorrent(options);
seeder.on('error',error=>console.error('Seeder:',error.message));
downloader.on('error',error=>console.error('Downloader:',error.message));
const service=createMediaService({clientFactory:()=>downloader,inspectionClientFactory:()=>inspector});
const server=createServer((req,res)=>{void service.handle(req,res);});
const audioTest=process.argv.includes('--audio');const run=promisify(execFile);let fixture;const subtitleFixtures=[];
let source=Buffer.alloc(256*1024);for(let i=0;i<source.length;i++)source[i]=i%251;
if(audioTest){const folder=fileURLToPath(new URL('../.cache/audio-fixtures/',import.meta.url));await mkdir(folder,{recursive:true});fixture=path.join(folder,`generated-${process.pid}.mkv`);for(const [language,text] of [['eng','English subtitle cue'],['jpn','Japanese subtitle cue']]){const file=path.join(folder,`subtitle-${process.pid}-${language}.srt`);await writeFile(file,`1\n00:00:00,100 --> 00:00:02,500\n${text}\n\n`);subtitleFixtures.push(file);}await run(ffmpegPath,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-i',subtitleFixtures[0],'-i',subtitleFixtures[1],'-map','0:v','-map','1:a','-map','2:a','-map','3:s','-map','4:s','-c:s','srt','-metadata:s:s:0','language=eng','-metadata:s:s:1','language=jpn','-metadata:s:a:0','language=eng','-metadata:s:a:1','language=jpn','-t','3','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','pcm_s16le',fixture],{windowsHide:true});source=await readFile(fixture);}
const filename=audioTest?'hasimio-audio-test.mkv':'hasimio-stream-test.mp4';
const watchdog=setTimeout(()=>{console.error('Torrent streaming smoke test timed out.');process.exit(1);},30000);
try {
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const seeded=await new Promise((resolve,reject)=>{seeder.seed(source,{name:filename,private:true,announce:[]},resolve);seeder.once('error',reject);});
  if(!seeder.listening)await once(seeder,'listening');
  for(const peerClient of [downloader,inspector])peerClient.on('add',torrent=>{torrent.once('infoHash',()=>torrent.addPeer(`127.0.0.1:${seeder.torrentPort}`));});
  const base=`http://127.0.0.1:${server.address().port}`;
  let response=await fetch(`${base}/api/torrents`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({infoHash:seeded.infoHash})});
  let status=await response.json();assert.equal(response.status,202,JSON.stringify(status));const id=status.id;
  while(status.state==='buffering'){await new Promise(r=>setTimeout(r,100));status=await(await fetch(`${base}/api/torrents/${id}`)).json();}
  assert.equal(status.state,'ready',status.error);assert.equal(status.files[0].name,filename);
  response=await fetch(`${base}${status.mediaUrl}`,{headers:{Range:'bytes=12345-23456'}});
  assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 12345-23456/${source.length}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),source.subarray(12345,23457));
  const download=await fetch(`${base}${status.mediaUrl}?download=1`,{headers:{Range:'bytes=0-127'}});assert.equal(download.status,206);assert.equal(download.headers.get('content-disposition'),"attachment; filename*=UTF-8''"+encodeURIComponent(filename));assert.deepEqual(Buffer.from(await download.arrayBuffer()),source.subarray(0,128));console.log('PASS: original video downloads use attachment headers and retain byte-range streaming.');
  if(audioTest){const inspectionResponse=await fetch(`${base}/api/torrent-inspections`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({infoHash:seeded.infoHash})});const inspection=await inspectionResponse.json();assert.equal(inspectionResponse.status,200,JSON.stringify(inspection));assert.equal(inspection.audioTracks.length,2);assert.equal(inspection.subtitleTracks.length,2);assert.equal((await(await fetch(`${base}/api/torrents/${id}`)).json()).state,'ready','Source inspection must not stop existing playback.');assert.equal((await(await fetch(`${base}/api/streaming/health`)).json()).active,1,'Inspection sessions must be cleaned up.');console.log('PASS: independent pre-playback inspection found actual audio/subtitle tracks, preserved active playback, and cleaned up.');response=await fetch(`${base}/api/torrents/${id}/audio-tracks`);assert.equal(response.status,200);const probed=await response.json();const tracks=probed.audioTracks;assert.equal(probed.subtitleTracks.length,2);assert.deepEqual(probed.subtitleTracks.map(t=>[t.language,t.supported]),[['eng',true],['jpn',true]]);const invalidSub=await fetch(`${base}/api/torrents/${id}/subtitles/99`,{method:'POST'});assert.equal(invalidSub.status,400);const subStart=await fetch(`${base}/api/torrents/${id}/subtitles/1`,{method:'POST'});assert.equal(subStart.status,202);let subStatus=await subStart.json();while(subStatus.subtitle.state==='preparing'){await new Promise(r=>setTimeout(r,100));subStatus=await(await fetch(`${base}/api/torrents/${id}`)).json();}assert.equal(subStatus.subtitle.state,'ready',subStatus.subtitle.error);const subResponse=await fetch(base+subStatus.subtitle.url);assert.equal(subResponse.headers.get('content-type'),'text/vtt; charset=utf-8');const captions=await subResponse.text();assert.match(captions,/WEBVTT/);assert.ok(captions.endsWith('\n\n'),'Finished subtitle output must include its final cue delimiter.');assert.match(captions,/Japanese subtitle cue/);assert.doesNotMatch(captions,/English subtitle cue/);console.log('PASS: discovered two subtitle languages; selected Japanese converted to timed WebVTT; unavailable track rejected.');assert.equal(tracks.length,2);assert.deepEqual(tracks.map(t=>t.language),['eng','jpn']);const invalid=await fetch(`${base}/api/torrents/${id}/audio`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({track:99})});assert.equal(invalid.status,400);response=await fetch(`${base}/api/torrents/${id}/audio`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({track:1})});assert.equal(response.status,202);do{await new Promise(r=>setTimeout(r,150));status=await(await fetch(`${base}/api/torrents/${id}`)).json();}while(status.audio?.state==='preparing');assert.equal(status.audio?.state,'ready',status.audio?.error);const playlistUrl=base+status.audio.mediaUrl;const playlist=await(await fetch(playlistUrl)).text();assert.match(playlist,/#EXT-X-MAP/);const decoded=await run(ffmpegPath,['-hide_banner','-i',playlistUrl,'-map','0:a:0','-t','1','-f','null','-'],{windowsHide:true});assert.match(decoded.stderr,/Audio: aac/);assert.match(decoded.stderr,/stereo/);assert.match(decoded.stderr,/Video: h264/);const pcm=await run(ffmpegPath,['-hide_banner','-loglevel','error','-i',playlistUrl,'-map','0:a:0','-t','1','-ac','1','-ar','48000','-f','s16le','pipe:1'],{windowsHide:true,encoding:'buffer'});let crossings=0;for(let i=2;i<pcm.stdout.length;i+=2)if(pcm.stdout.readInt16LE(i-2)<=0&&pcm.stdout.readInt16LE(i)>0)crossings++;assert.ok(crossings>840&&crossings<920,'Selected Japanese 880Hz dub must be heard, rather than the first 440Hz track: '+crossings);console.log('PASS: detected English/Japanese tracks; selected Japanese dub decoded at 880 Hz as AAC stereo; H.264 retained; invalid track rejected.');}
  response=await fetch(`${base}/api/torrents/${id}`,{method:'DELETE'});assert.equal(response.status,200);
  assert.equal((await fetch(`${base}/api/torrents/${id}`)).status,404);
  if(audioTest)assert.equal(await access(path.join(audioRoot,id,'0','1')).then(()=>false,()=>true),true,'Converted segments must be removed on stop.');
  if(audioTest)assert.equal(await access(path.join(audioRoot,id,'subtitles','0','1')).then(()=>false,()=>true),true,'Extracted subtitles must be removed on stop.');
  console.log('PASS: TCP torrent metadata, video file selection, seekable HTTP byte streaming, and stop/cleanup.');
} finally {
  clearTimeout(watchdog);await service.close();if(!inspector.destroyed)await new Promise(r=>inspector.destroy(r));await new Promise(r=>seeder.destroy(r));server.closeAllConnections();await new Promise(r=>server.close(r));if(fixture)await unlink(fixture);for(const file of subtitleFixtures)await unlink(file);
}
