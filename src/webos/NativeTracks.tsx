import {useEffect,useState,type RefObject} from 'react';
import {isWebOS,mediaCommand} from './platform';

type AudioTrack={language?:string;label?:string;enabled:boolean};
type AudioList=EventTarget&{length:number;[index:number]:AudioTrack};
type NativeVideo=HTMLVideoElement&{audioTracks?:AudioList;mediaId?:string};
export function useNativeTracks(reference:RefObject<HTMLVideoElement|null>){
  const [audio,setAudio]=useState<AudioTrack[]>([]),[subtitles,setSubtitles]=useState<TextTrack[]>([]),[error,setError]=useState('');
  const [,refresh]=useState(0);
  useEffect(()=>{
    if(!isWebOS)return;
    const video=reference.current as NativeVideo|null;if(!video)return;
    const update=()=>{setAudio(Array.from({length:video.audioTracks?.length??0},(_,index)=>video.audioTracks![index]));setSubtitles(Array.from(video.textTracks));refresh(value=>value+1);};
    video.addEventListener('loadedmetadata',update);video.addEventListener('playing',update);
    video.audioTracks?.addEventListener('addtrack',update);video.audioTracks?.addEventListener('change',update);
    video.textTracks.addEventListener('addtrack',update);video.textTracks.addEventListener('change',update);
    return()=>{video.removeEventListener('loadedmetadata',update);video.removeEventListener('playing',update);video.audioTracks?.removeEventListener('addtrack',update);video.audioTracks?.removeEventListener('change',update);video.textTracks.removeEventListener('addtrack',update);video.textTracks.removeEventListener('change',update);};
  },[reference]);
  if(!isWebOS)return;
  const label=(track:{language?:string;label?:string},index:number)=>track.label||track.language||'Track '+(index+1);
  async function select(type:'audio'|'text',index:number){
    const video=reference.current as NativeVideo|null;if(!video)return;setError('');
    try{
      if(type==='audio')audio.forEach((track,i)=>{track.enabled=i===index;});
      else subtitles.forEach((track,i)=>{track.mode=i===index?'showing':'disabled';});
      const mediaId=String(video.mediaId??'');
      if(mediaId&&mediaId!=='<invalid mediaId>'){
        if(type==='text')await mediaCommand('setSubtitleEnable',{mediaId,enable:index>=0});
        if(index>=0)await mediaCommand('selectTrack',{mediaId,type,index});
      }
      refresh(value=>value+1);
    }catch(problem){setError(problem instanceof Error?problem.message:'The TV could not switch tracks.');}
  }
  return {
    audio:<div className="audio-controls"><label>Audio / dub<select value={Math.max(0,audio.findIndex(track=>track.enabled))} onChange={event=>void select('audio',Number(event.target.value))}>{audio.length?audio.map((track,index)=><option value={index} key={index}>{label(track,index)}</option>):<option value={0}>TV default audio</option>}</select></label><small>The TV decodes the original audio. If it cannot play this codec, choose another source.</small>{error&&<p role="alert">{error}</p>}</div>,
    subtitles:<div className="audio-controls"><label>Embedded subtitles<select value={subtitles.findIndex(track=>track.mode==='showing')} onChange={event=>void select('text',Number(event.target.value))}><option value={-1}>Off</option>{subtitles.map((track,index)=><option value={index} key={index}>{label(track,index)}</option>)}</select></label><small>Tracks supported by the TV appear after the video opens.</small>{error&&<p role="alert">{error}</p>}</div>
  };
}
