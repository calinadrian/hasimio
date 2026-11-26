import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {ffmpegPath,inputGuard,stopFfmpeg} from './ffmpeg.mjs';

const MAX_SUBTITLE_BYTES=16*1024*1024;

export async function createSubtitleJob(id,fileIndex,track,input) {
  if(!/^[a-f\d]{36}$/.test(id)||![fileIndex,track].every(n=>Number.isInteger(n)&&n>=0))throw new Error('Invalid subtitle track.');
  const job={track,fileIndex,state:'preparing',closed:false,stopping:false,text:''};
  const args=['-hide_banner','-nostdin','-loglevel','error',...inputGuard,'-i',input,'-map','0:s:'+track,
    '-c:s','webvtt','-vn','-an','-flush_packets','1','-f','webvtt','pipe:1'];
  const child=spawn(ffmpegPath,args,{windowsHide:true,stdio:['ignore','pipe','ignore']});
  const decoder=new StringDecoder('utf8');
  let bytes=0;
  job.child=child;
  child.stdout.on('data',chunk=>{
    if(job.stopping||job.state==='error')return;
    bytes+=chunk.length;
    if(bytes>MAX_SUBTITLE_BYTES){
      job.state='error';job.error='This embedded subtitle track is too large. Choose another track or load a subtitle file.';
      job.text='';child.kill();return;
    }
    job.text+=decoder.write(chunk);
    if(job.state==='preparing'&&job.text.includes('-->'))job.state='ready';
  });
  child.on('error',()=>{job.state='error';job.error='Subtitle conversion could not start. Try loading an SRT or VTT file.';});
  child.on('close',code=>{
    job.closed=true;
    if(job.stopping||job.state==='error')return;
    if(code!==0){job.state='error';job.error='Could not extract this subtitle track. Try another track or load an SRT / VTT file.';return;}
    job.text=(job.text+decoder.end()).trimEnd()+'\n\n';job.state='ready';
  });
  return job;
}
export async function stopSubtitleJob(job){
  if(!job)return;
  job.stopping=true;job.text='';
  await stopFfmpeg(job);
}
export function subtitleStatus(job,id){return job?{track:job.track,state:job.state,error:job.error,url:'/api/torrents/'+id+'/subtitles/'+job.track+'.vtt?file='+job.fileIndex}:undefined;}
