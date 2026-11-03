import {useEffect,useRef} from 'react';
import {playerSettings,savePlayerSettings} from './preferences';
import {isWebOS,tvVideoBufferBytes} from './webos/platform';

export default function LiveVideo({url,onLoading,onError}:{url:string;onLoading:(loading:boolean)=>void;onError:()=>void}){
  const videoRef=useRef<HTMLVideoElement>(null),callbacks=useRef({onLoading,onError}),playbackIntent=useRef(true);
  callbacks.current={onLoading,onError};
  useEffect(()=>{
    const video=videoRef.current;if(!video)return;
    let active=true,hls:import('hls.js').default|undefined,reported=false,blocked=false,softRecovery=false,mediaRecoveries=0,networkRecoveries=0,repairing=false;
    let lastTime=0,lastAdvance=performance.now(),stableSince=lastAdvance;
    const settings=playerSettings();video.volume=settings.volume;video.muted=settings.muted;
    const fail=()=>{if(active&&!reported){reported=true;callbacks.current.onLoading(true);callbacks.current.onError();}};
    const play=()=>{if(active&&playbackIntent.current)void video.play().catch(error=>{if(!active||error?.name==='AbortError')return;if(error?.name==='NotAllowedError'){blocked=true;callbacks.current.onLoading(false);}else fail();});};
    const started=()=>{playbackIntent.current=true;blocked=false;repairing=false;reported=false;lastAdvance=performance.now();callbacks.current.onLoading(false);};
    const paused=()=>{if(!repairing&&!video.ended&&!video.error&&video.readyState>=2)playbackIntent.current=false;};
    const progress=()=>{
      if(Math.abs(video.currentTime-lastTime)<0.05)return;
      lastTime=video.currentTime;lastAdvance=performance.now();softRecovery=false;reported=false;callbacks.current.onLoading(false);
      if(lastAdvance-stableSince>15000){mediaRecoveries=0;networkRecoveries=0;stableSince=lastAdvance;}
    };
    const waiting=()=>{if(playbackIntent.current)callbacks.current.onLoading(true);};
    const error=()=>{if(!repairing)fail();};
    const online=()=>{if(playbackIntent.current&&performance.now()-lastAdvance>3000)fail();};
    video.addEventListener('playing',started);video.addEventListener('play',started);video.addEventListener('pause',paused);
    video.addEventListener('timeupdate',progress);video.addEventListener('waiting',waiting);video.addEventListener('stalled',waiting);
    video.addEventListener('error',error);video.addEventListener('ended',fail);window.addEventListener('online',online);
    // Watching actual playback progress also catches streams that freeze without
    // emitting a fatal error. A user pause never triggers the watchdog.
    const watchdog=setInterval(()=>{
      if(!active||blocked||!playbackIntent.current)return;
      const stalledFor=performance.now()-lastAdvance;
      if(stalledFor>=15000){fail();return;}
      if(stalledFor>=8000&&!softRecovery){
        softRecovery=true;callbacks.current.onLoading(true);
        const live=hls?.liveSyncPosition??(video.seekable.length?video.seekable.end(video.seekable.length-1)-1:undefined);
        if(live!==undefined&&Number.isFinite(live)&&live>video.currentTime+1)try{video.currentTime=live;}catch{/* A refreshed playlist may be needed. */}
        hls?.startLoad(-1);play();
      }
    },1000);
    const nativeHls=Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
    // Android advertises native HLS, but its separate media loader can fail on
    // the local proxied playlists. Keep requests and recovery in the WebView.
    const preferHls=import.meta.env.VITE_ANDROID==='true'||/Android/i.test(navigator.userAgent);
    const playNative=()=>{if(!active)return;if(!nativeHls){fail();return;}video.src=url;video.load();play();};
    if(nativeHls&&!preferHls)playNative();
    else void import('hls.js').then(({default:Hls})=>{
      if(!active)return;
      if(!Hls.isSupported()){playNative();return;}
      hls=new Hls({liveSyncDurationCount:3,liveMaxLatencyDurationCount:8,maxBufferLength:isWebOS?15:30,backBufferLength:isWebOS?0:30,...(isWebOS?{maxMaxBufferLength:20,maxBufferSize:tvVideoBufferBytes,enableWorker:false}:{})});
      hls.on(Hls.Events.MANIFEST_PARSED,play);
      hls.on(Hls.Events.ERROR,(_,data)=>{
        if(!active||!data.fatal)return;
        callbacks.current.onLoading(true);
        if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaRecoveries++<1){repairing=true;hls?.recoverMediaError();}
        else if(data.type===Hls.ErrorTypes.NETWORK_ERROR&&networkRecoveries++<2)hls?.startLoad(-1);
        else fail();
      });
      hls.loadSource(url);hls.attachMedia(video);
    }).catch(fail);
    return()=>{
      active=false;clearInterval(watchdog);
      video.removeEventListener('playing',started);video.removeEventListener('play',started);video.removeEventListener('pause',paused);
      video.removeEventListener('timeupdate',progress);video.removeEventListener('waiting',waiting);video.removeEventListener('stalled',waiting);
      video.removeEventListener('error',error);video.removeEventListener('ended',fail);window.removeEventListener('online',online);
      hls?.destroy();video.pause();video.removeAttribute('src');video.load();
    };
  },[url]);
  return <video ref={videoRef} className="live-tv-video" controls playsInline controlsList="nodownload" aria-label="Live TV video player" onVolumeChange={event=>savePlayerSettings({...playerSettings(),volume:event.currentTarget.volume,muted:event.currentTarget.muted})}/>;
}
