// Generated media only: compare packet probing with container-header inspection.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createReadStream} from 'node:fs';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {ffmpegPath} from '../server/ffmpeg.mjs';
import {parseAudioTracks,parseSubtitleTracks,probeAudioTracks} from '../server/compatible-audio.mjs';
import {byteRange} from '../server/torrent-utils.mjs';
import {inspectionStream} from '../server/inspection-stream.mjs';
import {createInspectionScheduler} from '../server/inspection-scheduler.mjs';

const run=promisify(execFile),folder=path.resolve('.cache/inspection-probe');
await mkdir(folder,{recursive:true});
for(const lang of ['eng','jpn'])await writeFile(path.join(folder,lang+'.srt'),`1\n00:00:00,100 --> 00:00:05,000\n${lang} generated subtitle\n`);
const movie=path.join(folder,'tracks.mkv');
await run(ffmpegPath,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-i',path.join(folder,'eng.srt'),'-i',path.join(folder,'jpn.srt'),'-map','0:v','-map','1:a','-map','2:a','-map','3:s','-map','4:s','-t','6','-c:v','libx264','-preset','ultrafast','-c:a','aac','-c:s','srt','-metadata:s:a:0','language=eng','-metadata:s:a:1','language=jpn','-metadata:s:s:0','language=eng','-metadata:s:s:1','language=jpn',movie],{windowsHide:true});
for(const [filename,flags] of [['faststart.mp4',['-movflags','+faststart']],['tail-metadata.mp4',[]],['tracks.webm',[]],['silent.mkv',[]]]){
  const webm=filename.endsWith('webm'),silent=filename.startsWith('silent');
  await run(ffmpegPath,['-hide_banner','-loglevel','error','-y','-i',movie,'-map','0:v',...(!silent?['-map','0:a','-map','0:s']:[]),'-c:v',webm?'libvpx-vp9':'copy',...(webm?['-deadline','realtime','-cpu-used','8']:[]),...(!silent?['-c:a',webm?'libopus':'copy','-c:s',webm?'webvtt':'mov_text']:[]),...flags,path.join(folder,filename)],{windowsHide:true});
}
let served=0,requests=0;
const server=createServer(async(req,res)=>{
  let stream;
  try{
    const file=path.join(folder,path.basename(new URL(req.url,'http://localhost').pathname));
    const size=(await stat(file)).size,range=byteRange(req.headers.range,size);requests++;
    assert.ok(range);res.writeHead(range.partial?206:200,{'Content-Length':range.end-range.start+1,'Accept-Ranges':'bytes',...(range.partial?{'Content-Range':`bytes ${range.start}-${range.end}/${size}`}:{})});
    stream=inspectionStream({createReadStream:range=>createReadStream(file,{...range,highWaterMark:16*1024})},range);
    res.once('close',()=>stream.destroy());
    for await(const chunk of stream){
      // Modest peer latency makes unnecessary reads visible in the timings.
      await new Promise(resolve=>setTimeout(resolve,3));if(res.destroyed)break;
      served+=chunk.length;if(!res.write(chunk))await Promise.race([once(res,'drain'),once(res,'close')]);
    }
    res.end();
  }catch(error){if(!res.destroyed)res.destroy(error);}finally{stream?.destroy();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`,results=[];
async function oldProbe(url,fast=true){
  let stderr;
  try{await run(ffmpegPath,['-hide_banner','-nostdin',...(fast?['-analyzeduration','100000','-probesize','262144','-fpsprobesize','0']:[]),'-i',url],{windowsHide:true,timeout:35000});}
  catch(error){assert.equal(error.code,1,error.stderr);stderr=error.stderr;}
  const audioTracks=parseAudioTracks(stderr),subtitleTracks=parseSubtitleTracks(stderr);
  if(fast&&!audioTracks.length)return oldProbe(url,false);
  return {audioTracks,subtitleTracks};
}
try{
  for(const filename of ['tracks.mkv','faststart.mp4','tail-metadata.mp4','tracks.webm','silent.mkv']){
    const timings=[];
    for(const [mode,probe] of [['previous',oldProbe],['headers',url=>probeAudioTracks(url,undefined,{fast:true})]]){
      served=0;requests=0;const start=performance.now(),tracks=await probe(base+'/'+filename),ms=Math.round(performance.now()-start);
      await new Promise(resolve=>setTimeout(resolve,20));
      assert.equal(tracks.audioTracks.length,filename==='silent.mkv'?0:2);
      assert.equal(tracks.subtitleTracks.length,filename==='silent.mkv'?0:2);
      if(filename!=='silent.mkv'){
        assert.deepEqual(tracks.audioTracks.map(t=>t.language),['eng','jpn']);assert.deepEqual(tracks.subtitleTracks.map(t=>t.language),['eng','jpn']);
        assert.ok(tracks.subtitleTracks.every(t=>t.supported));
      }
      timings.push({mode,ms,bytes:served,requests});
    }
    results.push({filename,timings});console.log(JSON.stringify(results.at(-1)));
  }
  const batch=[];
  for(const [mode,concurrency,probe] of [['previous',2,oldProbe],['headers',4,url=>probeAudioTracks(url,undefined,{fast:true})]]){
    const schedule=createInspectionScheduler(concurrency),start=performance.now();served=0;requests=0;
    await Promise.all(Array.from({length:8},(_,index)=>schedule(String(index),()=>probe(base+'/'+['tracks.mkv','faststart.mp4','tail-metadata.mp4','silent.mkv'][index%4]))));
    await new Promise(resolve=>setTimeout(resolve,20));batch.push({mode,concurrency,ms:Math.round(performance.now()-start),bytes:served,requests});
  }
  console.log(JSON.stringify({eightSourceBatch:batch}));
  await writeFile(path.join(folder,'results.json'),JSON.stringify({files:results,batch},null,2));
  console.log('PASS: header checks verified all tracks for MKV, MP4 (both metadata locations), WebM, and silent video.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
