// Decode actual production HLS output from generated, synchronized flash/tone
// fixtures. Exercises long GOPs, B-frames, surround codecs, seeks and resampling.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const root=path.resolve('.cache/audio-sync-smoke');
process.env.HASIMIO_CACHE_DIR=root;
const {createAudioJob,stopAudioJob}=await import('../server/compatible-audio.mjs');
const {byteRange}=await import('../server/torrent-utils.mjs');
const run=promisify(execFile),fixtures=new Map();
await mkdir(root,{recursive:true});
const server=createServer((req,res)=>{
  const bytes=fixtures.get(req.url);
  if(!bytes){res.writeHead(404);return res.end();}
  const range=byteRange(req.headers.range,bytes.length);
  if(!range){res.writeHead(416);return res.end();}
  const headers={'Content-Length':range.end-range.start+1,'Accept-Ranges':'bytes'};
  if(range.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${bytes.length}`;
  res.writeHead(range.partial?206:200,headers);res.end(bytes.subarray(range.start,range.end+1));
});
function firstTimestamp(log){
  const tb=/^#tb 0: (\d+)\/(\d+)$/m.exec(log),frame=/^0,\s*(-?\d+),/m.exec(log);
  assert.ok(tb&&frame,'Decoded frame timestamps must be available');
  return Number(frame[1])*Number(tb[1])/Number(tb[2]);
}
async function packetTime(playlist,kind){
  const {stdout}=await run(ffmpeg,['-hide_banner','-loglevel','error','-copyts','-i',playlist,'-map',`0:${kind}:0`,`-frames:${kind}`,'1','-f','framemd5','-'],{windowsHide:true});
  return firstTimestamp(stdout);
}
try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  for(const [number,codec,rate,channels] of [[1,'ac3',48000,6],[2,'eac3',48000,6],[3,'aac',44100,2],[4,'pcm_s16le',96000,2]]){
    const file=path.join(root,`${codec}.mkv`);
    await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',"color=c=black:s=160x90:r=24:d=20,drawbox=color=white:t=fill:enable='between(t,10,11)'",'-f','lavfi','-i',`aevalsrc=if(between(t\\,10\\,11)\\,0.5*sin(2*PI*440*t)\\,0):s=${rate}:d=20`,'-c:v','libx264','-preset','fast','-g','96','-keyint_min','96','-sc_threshold','0','-c:a',codec,'-ac',String(channels),...(codec==='pcm_s16le'?['-output_ts_offset','5']:[]),file],{windowsHide:true});
    fixtures.set('/fixture',await readFile(file));
    // Reuse the same session/track folder as a seek or retry does in production.
    for(const start of [7.3,0]){
      const job=await createAudioJob(String(number).repeat(36),0,`http://127.0.0.1:${server.address().port}/fixture`,`${codec}.mkv`,0,start);
      try{
        if(!job.closed)await once(job.child,'close');
        for(let n=0;n<30&&job.state==='preparing';n++)await new Promise(resolve=>setTimeout(resolve,50));
        assert.equal(job.state,'ready',job.error+'\n'+job.log);
        const playlist=path.join(job.folder,'main.m3u8');
        const video=await packetTime(playlist,'v'),audio=await packetTime(playlist,'a');
        assert.ok(Math.abs(video-audio)<0.15,`${codec} seek ${start}: audio starts ${audio-video}s apart from video`);
        const {stderr}=await run(ffmpeg,['-hide_banner','-i',playlist,'-vf','blackdetect=d=0.05:pix_th=0.5','-af','silencedetect=noise=-30dB:d=0.05','-f','null','-'],{windowsHide:true});
        assert.match(stderr,/Audio: aac.*48000 Hz, stereo/);
        const flash=/black_start:[\d.]+ black_end:([\d.]+)/.exec(stderr);
        const tone=/silence_end: ([\d.]+)/.exec(stderr);
        assert.ok(flash&&tone,'Flash and tone must both decode');
        const delta=Number(tone[1])-Number(flash[1]);
        assert.ok(Math.abs(delta)<0.15,`${codec} seek ${start}: flash/tone drift ${delta}s`);
        console.log(`PASS: ${codec}, ${rate} Hz, ${channels} channels, seek ${start}s: flash/tone difference ${delta.toFixed(3)}s; audio/video start difference ${(audio-video).toFixed(3)}s`);
      }finally{await stopAudioJob(job);}
    }
  }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
