import {spawn,execFile} from 'node:child_process';
import {access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {ffmpegPath,inputGuard,stopFfmpeg} from './ffmpeg.mjs';
import {createHlsOutput,HLS_WINDOW} from './hls-output.mjs';
import {cacheDir} from './paths.mjs';

export const audioRoot=cacheDir('compatible-audio');
function parseTracks(log,type) {
  const tracks=[];let current;
  for(const line of log.split(/\r?\n/)){
    if(/^\s*Stream #/.test(line)){
      current=undefined;
      const match=/Stream #0:(\d+)(?:\[[^\]]*\])?(?:\(([^)]+)\))?: (Audio|Subtitle): ([^,]+)/.exec(line);
      if(match&&match[3]===type){current={index:tracks.length,language:match[2]||'und',codec:match[4].trim(),default:line.includes('(default)'),...(type==='Subtitle'?{supported:/^(?:subrip|ass|ssa|webvtt|mov_text|text)\b/i.test(match[4])}: {})};tracks.push(current);}
    }else if(current){const title=/^\s+title\s*:\s*(.+)$/i.exec(line);if(title)current.title=title[1].trim();}
  }
  return tracks;
}
export const parseAudioTracks=log=>parseTracks(log,'Audio');
export const parseSubtitleTracks=log=>parseTracks(log,'Subtitle');
export function parseMediaDuration(log) {
  const match=/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(log);
  return match?Number(match[1])*3600+Number(match[2])*60+Number(match[3]):undefined;
}
export function probeAudioTracks(input,signal,{fast=false}={}) {
  return new Promise((resolve,reject)=>{
    // FFmpeg exits with code 1 after printing input metadata when no output is specified.
    execFile(ffmpegPath,['-hide_banner','-nostdin',...inputGuard,...(fast?['-nofind_stream_info']:[]),'-i',input],{windowsHide:true,timeout:35000,maxBuffer:1024*1024,signal},(error,stdout,stderr)=>{
      if(signal?.aborted)return reject(new Error('Track check cancelled.'));
      if(error&&(error.killed||error.code!==1))return reject(new Error('Could not read audio languages. Retry once more video has buffered.'));
      if(!/Stream #0:\d+.*(?:Video|Audio):/.test(stderr)){
        if(fast)return resolve(probeAudioTracks(input,signal));
        return reject(new Error('Audio information is not ready. Retry once more video has buffered.'));
      }
      const tracks={duration:parseMediaDuration(stderr),audioTracks:parseAudioTracks(stderr),subtitleTracks:parseSubtitleTracks(stderr)};
      // Header-based containers declare every track, including genuinely silent
      // files. Do not download packets just to reconfirm that no audio exists.
      resolve(tracks);
    });
  });
}
// Copied video can only start on a keyframe, so input seeking lands up to one
// GOP before the request. Read the first packet's source time to report it.
export function parseKeyframeTime(log) {
  const base=/^#tb 0: (\d+)\/(\d+)$/m.exec(log),packet=/^0,\s*(-?\d+),/m.exec(log),origin=/Duration:[^\n]*start: (-?\d+(?:\.\d+)?)/.exec(log);
  return base&&packet?Number(packet[1])*Number(base[1])/Number(base[2])-(origin?Number(origin[1]):0):undefined;
}
export function keyframeTime(input,start,signal) {
  return new Promise(resolve=>{
    execFile(ffmpegPath,['-hide_banner','-nostdin',...inputGuard,'-ss',String(start),'-i',input,'-map','0:v:0','-c','copy','-copyts','-frames:v','1','-f','framemd5','-'],{windowsHide:true,timeout:15000,maxBuffer:1024*1024,signal},(error,stdout,stderr)=>{
      const time=error?undefined:parseKeyframeTime(stdout+'\n'+stderr);
      resolve(Number.isFinite(time)&&time<=start+0.5?Math.max(0,Math.min(start,time)):start);
    });
  });
}

// Read quickly at startup, then pace the source. The output window applies a
// separate hard limit to read-ahead even if the viewer pauses indefinitely.
export const CONVERSION_BURST_SECONDS=60,CONVERSION_SPEED=2;
export function audioArguments(input,outputUrl,hevc=false,track=0,start=0) {
  if(!Number.isInteger(track)||track<0)throw new Error('Invalid audio track.');
  if(!Number.isFinite(start)||start<0)throw new Error('Invalid seek position.');
  // Preserve keyframe preroll in both tracks so input seeking keeps them in sync.
  return ['-hide_banner','-nostdin','-loglevel','warning',...inputGuard,
    ...(start?['-ss',String(start),'-noaccurate_seek']:[]),
    '-readrate',String(CONVERSION_SPEED),'-readrate_initial_burst',String(CONVERSION_BURST_SECONDS),'-i',input,
    '-map','0:v:0','-map',`0:a:${track}`,'-c:v','copy',...(hevc?['-tag:v','hvc1']:[]),
    '-c:a','aac','-ac','2','-ar','48000','-af','aresample=async=1','-b:a','192k','-sn','-dn','-avoid_negative_ts','make_zero',
    '-f','hls','-hls_segment_type','fmp4','-hls_time','4','-hls_list_size',String(HLS_WINDOW),'-hls_flags','independent_segments',
    '-hls_fmp4_init_filename','init.mp4','-hls_segment_filename',outputUrl+'segment-%06d.m4s','-method','PUT','-http_persistent','1',outputUrl+'main.m3u8'];
}
export async function createAudioJob(id,index,input,filename='',track=0,start=0) {
  if(!/^[a-f\d]{36}$/.test(id)||!Number.isInteger(index)||index<0)throw new Error('Invalid audio session.');
  await access(ffmpegPath);
  const offset=start?await keyframeTime(input,start):0;
  const job={index,start,offset,track,generation:randomBytes(8).toString('hex'),state:'preparing',closed:false,stopping:false,log:''};
  function fail(message){
    if(job.stopping||job.state==='error')return;
    job.state='error';job.error=message;
  }
  const output=await createHlsOutput(
    ()=>{if(job.state==='preparing')job.state='ready';},
    error=>{fail(error.message);job.output?.dispose();job.child?.kill();}
  );
  job.output=output;
  try{
    const args=audioArguments(input,output.url,/\bhevc\b|[xh][ ._-]?265/i.test(filename),track,start);
    const child=spawn(ffmpegPath,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
    job.child=child;
    child.stderr.on('data',data=>{job.log=(job.log+data.toString()).slice(-6000);});
    child.on('error',error=>{fail('Audio conversion could not start: '+error.message);});
    child.on('close',code=>{
      job.closed=true;
      if(job.stopping)return;
      if(code===0){output.writerExited();return;}
      output.dispose();
      fail(/matches no streams/i.test(job.log)?'This file has no audio track to convert.':'Could not prepare compatible audio. Try another source.');
      if(process.env.HASIMIO_AUDIO_DEBUG==='1')console.error({code,log:job.log.replaceAll(input,'[local video]').replaceAll(output.url,'[local output]/')});
    });
    return job;
  }catch(error){output.dispose();throw error;}
}
export async function stopAudioJob(job) {
  if(!job)return;
  job.stopping=true;
  job.output.dispose();
  await stopFfmpeg(job);
}
export function audioStatus(job,id) {return job?{state:job.state,track:job.track,attempt:job.attempt??0,start:job.start,offset:job.offset,error:job.error,mediaUrl:job.state==='ready'?`/api/torrents/${id}/audio/main.m3u8?track=${job.track}&job=${job.generation}`:undefined}:undefined;}
