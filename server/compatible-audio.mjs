import {spawn,execFile} from 'node:child_process';
import {mkdir,readFile,rm,access,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {ffmpegPath,inputGuard} from './ffmpeg.mjs';
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
export function audioArguments(input,folder,hevc=false,track=0,start=0) {
  if(!Number.isInteger(track)||track<0)throw new Error('Invalid audio track.');
  if(!Number.isFinite(start)||start<0)throw new Error('Invalid seek position.');
  // Copied video retains keyframe preroll. Keep the same audio preroll instead
  // of trimming only the transcoded track to the requested seek position.
  return ['-hide_banner','-nostdin','-loglevel','warning','-y',...inputGuard,...(start?['-ss',String(start),'-noaccurate_seek']:[]),'-i',input,'-map','0:v:0','-map',`0:a:${track}`,'-c:v','copy',...(hevc?['-tag:v','hvc1']:[]),'-c:a','aac','-ac','2','-ar','48000','-af','aresample=async=1','-b:a','192k','-sn','-dn','-avoid_negative_ts','make_zero','-f','hls','-hls_segment_type','fmp4','-hls_time','4','-hls_list_size','0','-hls_playlist_type','event','-hls_flags','independent_segments','-hls_fmp4_init_filename','init.mp4','-hls_segment_filename',path.join(folder,'segment-%06d.m4s'),path.join(folder,'main.m3u8')];
}
export async function createAudioJob(id,index,input,filename='',track=0,start=0) {
  if(!/^[a-f\d]{36}$/.test(id)||!Number.isInteger(index)||index<0)throw new Error('Invalid audio session.');
  await access(ffmpegPath);
  const folder=path.join(audioRoot,id,String(index),String(track));await mkdir(folder,{recursive:true});
  const offset=start?await keyframeTime(input,start):0;
  const job={folder,index,start,offset,generation:randomBytes(8).toString('hex'),state:'preparing',error:undefined,child:undefined,closed:false,stopping:false,log:'',timer:undefined};
  async function check() {try {const playlist=await readFile(path.join(folder,'main.m3u8'),'utf8');if(playlist.includes('#EXTINF:')){await access(path.join(folder,'init.mp4'));job.state='ready';clearInterval(job.timer);}}catch{/* FFmpeg has not produced the first segment yet. */}}
  job.track=track;
  const child=spawn(ffmpegPath,audioArguments(input,folder,/\bhevc\b|[xh][ ._-]?265/i.test(filename),track,start),{cwd:folder,windowsHide:true,stdio:['ignore','ignore','pipe']});job.child=child;
  child.stderr.on('data',data=>{job.log=(job.log+data.toString()).slice(-6000);});
  child.on('error',error=>{job.state='error';job.error=`Audio conversion could not start: ${error.message}`;clearInterval(job.timer);});
  child.on('close',async code=>{job.closed=true;clearInterval(job.timer);if(job.stopping)return;await check();if(code!==0||job.state!=='ready'){job.state='error';job.error=/matches no streams/i.test(job.log)?'This file has no audio track to convert.':'Could not prepare compatible audio. Try another source.';if(process.env.HASIMIO_AUDIO_DEBUG==='1')console.error({code,files:await readdir(folder),log:job.log.replaceAll(input,'[local video]')});}});
  job.timer=setInterval(check,500);job.timer.unref();return job;
}
export async function stopAudioJob(job) {
  if(!job)return;job.stopping=true;clearInterval(job.timer);
  if(!job.closed&&job.child){await new Promise(resolve=>{const timer=setTimeout(resolve,3000);job.child.once('close',()=>{clearTimeout(timer);resolve();});job.child.kill();});}
  const target=path.resolve(job.folder),root=path.resolve(audioRoot)+path.sep;
  if(!target.startsWith(root))throw new Error('Refusing audio cleanup outside the audio cache.');
  await rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
export function audioStatus(job,id) {return job?{state:job.state,track:job.track,start:job.start,offset:job.offset,error:job.error,mediaUrl:job.state==='ready'?`/api/torrents/${id}/audio/main.m3u8?track=${job.track}&job=${job.generation}`:undefined}:undefined;}
