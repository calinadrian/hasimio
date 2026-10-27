import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {ffmpegPath} from './ffmpeg.mjs';
import {audioRoot} from './compatible-audio.mjs';

export async function createSubtitleJob(id,fileIndex,track,input) {
  if(!/^[a-f\d]{36}$/.test(id)||![fileIndex,track].every(n=>Number.isInteger(n)&&n>=0))throw new Error('Invalid subtitle track.');
  const folder=path.join(audioRoot,id,'subtitles',String(fileIndex),String(track));
  await mkdir(folder,{recursive:true});
  const job={folder,track,fileIndex,state:'preparing',closed:false,stopping:false,error:undefined,timer:undefined,child:undefined};
  const output=path.join(folder,'captions.vtt');
  async function check(){try{const text=await readFile(output,'utf8');if(text.includes('-->')){job.state='ready';clearInterval(job.timer);}}catch{/* Waiting for torrent data and the first cue. */}}
  const child=spawn(ffmpegPath,['-hide_banner','-nostdin','-loglevel','error','-y','-i',input,'-map',`0:s:${track}`,'-c:s','webvtt','-vn','-an','-flush_packets','1',output],{cwd:folder,windowsHide:true,stdio:'ignore'});
  job.child=child;
  child.on('error',()=>{job.state='error';job.error='Subtitle conversion could not start. Try loading an SRT or VTT file.';clearInterval(job.timer);});
  child.on('close',async code=>{job.closed=true;clearInterval(job.timer);if(job.stopping)return;if(code!==0){job.state='error';job.error='Could not extract this subtitle track. Try another track or load an SRT / VTT file.';}else{await check();job.state='ready';}});
  job.timer=setInterval(check,750);job.timer.unref();return job;
}
export function subtitleStatus(job,id){return job?{track:job.track,state:job.state,error:job.error,url:`/api/torrents/${id}/subtitles/${job.track}.vtt?file=${job.fileIndex}`}:undefined;}
