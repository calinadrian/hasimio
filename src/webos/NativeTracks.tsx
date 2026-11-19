import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import type Hls from 'hls.js';
import {isWebOS,mediaCommand} from './platform';
import {languageName,preferredTrack,sameLanguage} from '../playback-tracks';
import type {SubtitleSelection} from '../subtitle-selection';

type AudioTrack={language?:string;label?:string;enabled:boolean};
type AudioList=EventTarget&{length:number;[index:number]:AudioTrack};
type NativeVideo=HTMLVideoElement&{audioTracks?:AudioList;mediaId?:string};
type Track={index:number;language:string;label:string;default?:boolean};
export type HlsTracks={url:string;engine:Hls;events:typeof Hls.Events};

function tracksFor(video:NativeVideo|undefined,hls?:Hls,overlay?:TextTrack){
  const nativeAudio=Array.from(video?.audioTracks??[]);
  const nativeText=Array.from(video?.textTracks??[]);
  return {
    audio:hls?hls.audioTracks.map((track,index):Track=>({index,language:track.lang||'',label:track.name,default:track.default}))
      :nativeAudio.map((track,index):Track=>({index,language:track.language||'',label:track.label||'',default:track.enabled})),
    subtitles:hls?hls.subtitleTracks.map((track,index):Track=>({index,language:track.lang||'',label:track.name,default:track.default&&!track.forced}))
      :nativeText.flatMap((track,index):Track[]=>track!==overlay&&(track.kind==='subtitles'||track.kind==='captions')
        ?[{index,language:track.language,label:track.label}]:[]),
    audioIndex:hls?hls.audioTrack:nativeAudio.findIndex(track=>track.enabled),
    subtitleIndex:hls?(hls.subtitleDisplay?hls.subtitleTrack:-1):nativeText.findIndex(track=>track.mode==='showing'),
  };
}

export function useNativeTracks(reference:RefObject<HTMLVideoElement|null>,{
  url,hls,audioLanguage,subtitleLanguage,autoSubtitles,selection,manageAudio,manageSubtitles,overlay,
}:{
  url?:string;hls?:HlsTracks;audioLanguage:string;subtitleLanguage:string;autoSubtitles:boolean;
  selection:SubtitleSelection;manageAudio:boolean;manageSubtitles:boolean;overlay:RefObject<TextTrack|undefined>;
}){
  const [revision,refresh]=useState(0);
  const [readyUrl,setReadyUrl]=useState<string>();
  const [error,setError]=useState('');
  const manualAudio=useRef<{url?:string;track:Track}>(undefined);
  const backend=hls?.url===url?hls:undefined;
  const tracks=useMemo(()=>tracksFor((reference.current as NativeVideo|null)??undefined,backend?.engine,overlay.current),[reference,backend,overlay,url,revision]);

  useEffect(()=>{
    const media=reference.current as NativeVideo|null;
    if(!media||!url)return;
    const update=()=>refresh(value=>value+1);
    const loaded=()=>{setReadyUrl(url);update();};
    const reset=()=>setReadyUrl(undefined);
    media.addEventListener('loadstart',reset);
    media.addEventListener('loadedmetadata',loaded);
    media.addEventListener('playing',loaded);
    media.audioTracks?.addEventListener?.('addtrack',update);
    media.audioTracks?.addEventListener?.('change',update);
    media.textTracks.addEventListener('addtrack',update);
    media.textTracks.addEventListener('removetrack',update);
    media.textTracks.addEventListener('change',update);
    if(media.readyState>=1)loaded();
    const hlsEvents=backend?.events;
    const engine=backend?.engine;
    const events=hlsEvents?[hlsEvents.AUDIO_TRACKS_UPDATED,hlsEvents.AUDIO_TRACK_SWITCHED,hlsEvents.SUBTITLE_TRACKS_UPDATED,hlsEvents.SUBTITLE_TRACK_SWITCH]:[];
    for(const event of events)engine?.on(event,update);
    return()=>{
      media.removeEventListener('loadstart',reset);
      media.removeEventListener('loadedmetadata',loaded);
      media.removeEventListener('playing',loaded);
      media.audioTracks?.removeEventListener?.('addtrack',update);
      media.audioTracks?.removeEventListener?.('change',update);
      media.textTracks.removeEventListener('addtrack',update);
      media.textTracks.removeEventListener('removetrack',update);
      media.textTracks.removeEventListener('change',update);
      for(const event of events)engine?.off(event,update);
    };
  },[reference,url,backend]);

  const manual=manualAudio.current?.url===url?manualAudio.current?.track:undefined;
  const manualMatches=manual?tracks.audio.filter(track=>track.label===manual.label&&track.language===manual.language):[];
  const audio=manual?manualMatches.find(track=>track.index===manual.index)??manualMatches[0]:preferredTrack(tracks.audio,audioLanguage);
  const choice=selection.choice;
  const original=choice?.kind==='embedded'&&choice.source==='native'?choice:undefined;
  const subtitles=original?tracks.subtitles.filter(track=>(track.language===original.language||sameLanguage(track.language,original.language))&&track.label===original.title):[];
  const subtitle=original?subtitles.find(track=>track.index===original.index)??subtitles[0]
    :!choice&&autoSubtitles?preferredTrack(tracks.subtitles,subtitleLanguage):undefined;
  const subtitleIndex=subtitle?.index??-1;

  function select(kind:'audio'|'text',index:number){
    const media=reference.current as NativeVideo|null;if(!media)return;
    const engine=backend?.engine;
    if(kind==='audio'){
      if(engine){if(engine.audioTrack===index)return;engine.audioTrack=index;}
      else{
        const list=Array.from(media.audioTracks??[]);
        if(list.findIndex(track=>track.enabled)===index||!list[index])return;
        list.forEach((track,i)=>{track.enabled=i===index;});
      }
    }else if(engine){
      if(engine.subtitleTrack===index&&engine.subtitleDisplay===(index>=0))return;
      engine.subtitleDisplay=index>=0;
      if(engine.subtitleTrack!==index)engine.subtitleTrack=index;
    }else{
      if(!tracks.subtitles.length||tracks.subtitleIndex===index)return;
      for(const track of tracks.subtitles)media.textTracks[track.index].mode=track.index===index?'showing':'disabled';
    }
    const mediaId=media.mediaId;
    if(!engine&&isWebOS&&mediaId&&mediaId!=='<invalid mediaId>'){
      void (async()=>{
        if(kind==='text')await mediaCommand('setSubtitleEnable',{mediaId,enable:index>=0});
        if(index>=0)await mediaCommand('selectTrack',{mediaId,type:kind,index});
      })().catch(problem=>setError(problem instanceof Error?problem.message:'This device could not switch tracks.'));
    }
    refresh(value=>value+1);
  }
  useEffect(()=>{
    if(!url||(!backend&&readyUrl!==url))return;
    if(manageAudio&&audio)select('audio',audio.index);
    if(manageSubtitles)select('text',subtitleIndex);
  });
  const label=(track:Track)=>track.label||(track.language?languageName(track.language):'Track '+(track.index+1));
  return {
    subtitleLanguages:readyUrl===url&&url?tracks.subtitles.map(track=>track.language):undefined,
    activeSubtitle:manageSubtitles&&!!subtitle,
    audio:manageAudio&&tracks.audio.length>0?<div className="audio-controls"><label>Audio / dub<select value={tracks.audioIndex} onChange={event=>{
      const track=tracks.audio.find(item=>item.index===Number(event.target.value));
      if(track){manualAudio.current={url,track};setError('');select('audio',track.index);}
    }}><option value={-1} disabled>Source default</option>{tracks.audio.map(track=><option value={track.index} key={track.index}>{label(track)}</option>)}</select></label>{error&&<p role="alert">{error}</p>}</div>:undefined,
    subtitles:manageSubtitles&&tracks.subtitles.length>0?<div className="audio-controls"><label>Embedded subtitles<select value={tracks.subtitleIndex} onChange={event=>{
      const track=tracks.subtitles.find(item=>item.index===Number(event.target.value));
      setError('');
      selection.choose(track?{kind:'embedded',source:'native',index:track.index,language:track.language,title:track.label}:{kind:'off'});
      select('text',track?.index??-1);
    }}><option value={-1}>Off</option>{tracks.subtitles.map(track=><option value={track.index} key={track.index}>{label(track)}</option>)}</select></label>{error&&<p role="alert">{error}</p>}</div>:undefined,
  };
}
