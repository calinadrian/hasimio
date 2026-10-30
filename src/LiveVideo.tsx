import {useEffect,useRef} from 'react';
import {playerSettings,savePlayerSettings} from './preferences';

export default function LiveVideo({url,onLoading,onError}:{url:string;onLoading:(loading:boolean)=>void;onError:()=>void}){
  const videoRef=useRef<HTMLVideoElement>(null),callbacks=useRef({onLoading,onError});
  callbacks.current={onLoading,onError};
  useEffect(()=>{
    const video=videoRef.current;if(!video)return;
    let active=true,hls:import('hls.js').default|undefined,recovered=false;
    const settings=playerSettings();video.volume=settings.volume;video.muted=settings.muted;
    const fail=()=>{if(active)callbacks.current.onError();};
    const play=()=>{if(active)void video.play().catch(()=>{if(active)callbacks.current.onLoading(false);});};
    if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=url;play();}
    else void import('hls.js').then(({default:Hls})=>{
      if(!active)return;
      if(!Hls.isSupported()){fail();return;}
      hls=new Hls({liveSyncDurationCount:3,liveMaxLatencyDurationCount:8,maxBufferLength:30,backBufferLength:30});
      hls.on(Hls.Events.MANIFEST_PARSED,play);
      hls.on(Hls.Events.ERROR,(_,data)=>{
        if(!data.fatal)return;
        if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&!recovered){recovered=true;hls?.recoverMediaError();}
        else fail();
      });
      hls.loadSource(url);hls.attachMedia(video);
    }).catch(fail);
    return()=>{active=false;hls?.destroy();video.pause();video.removeAttribute('src');video.load();};
  },[url]);
  return <video ref={videoRef} className="live-tv-video" controls autoPlay playsInline controlsList="nodownload" aria-label="Live TV video player" onPlaying={()=>onLoading(false)} onWaiting={()=>onLoading(true)} onError={onError} onVolumeChange={event=>savePlayerSettings({...playerSettings(),volume:event.currentTarget.volume,muted:event.currentTarget.muted})}/>;
}
