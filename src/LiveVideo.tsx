import {useEffect,useRef,useState} from 'react';
import {Maximize,Minimize} from 'lucide-react';
import {playerSettings,savePlayerSettings} from './preferences';
import {isWebOS,tvVideoBufferBytes} from './webos/platform';

import {androidHlsLimits,isAndroid,isAndroidArm32,isAndroidTV} from './android/platform';

export default function LiveVideo({url,onLoading,onError}:{url:string;onLoading:(loading:boolean)=>void;onError:()=>void}){
  const videoRef=useRef<HTMLVideoElement>(null),callbacks=useRef({onLoading,onError}),playbackIntent=useRef(true);
  const fullscreenButton=useRef<HTMLButtonElement>(null);
  const [expanded,setExpanded]=useState(false);

  callbacks.current={onLoading,onError};
  useEffect(()=>{
    if(!isAndroidTV)return;
    if(document.activeElement===document.body)fullscreenButton.current?.focus({preventScroll:true});
    const restoreFocus=()=>{
      if(!document.fullscreenElement&&videoRef.current===document.activeElement)fullscreenButton.current?.focus({preventScroll:true});
    };
    document.addEventListener('fullscreenchange',restoreFocus);
    return()=>document.removeEventListener('fullscreenchange',restoreFocus);
  },[]);

  async function toggleFullscreen(){
    if(expanded){setExpanded(false);return;}
    const video=videoRef.current;
    try{
      if(video?.requestFullscreen){await video.requestFullscreen();return;}
    }catch{/* Older WebViews can reject the fullscreen request. */}
    setExpanded(true);
  }

  useEffect(()=>{
    const video=videoRef.current;if(!video)return;
    playbackIntent.current=true;
    let active=true,hls:import('hls.js').default|undefined,reported=false,blocked=false,softRecovery=false,mediaRecoveries=0,networkRecoveries=0,repairing=false;
    let loading=true;
    const reportLoading=(value:boolean)=>{
      if(loading===value)return;
      loading=value;
      callbacks.current.onLoading(value);
    };
    let lastTime=0,lastAdvance=performance.now(),stableSince=lastAdvance;
    const settings=playerSettings();video.volume=settings.volume;video.muted=settings.muted;
    const fail=()=>{if(active&&!reported){reported=true;reportLoading(true);callbacks.current.onError();}};
    const play=()=>{if(active&&playbackIntent.current)void video.play().catch(error=>{if(!active||error?.name==='AbortError')return;if(error?.name==='NotAllowedError'){blocked=true;reportLoading(false);}else fail();});};
    const requestedPlay=()=>{playbackIntent.current=true;blocked=false;lastAdvance=performance.now();};
    const started=()=>{requestedPlay();repairing=false;reported=false;reportLoading(false);};
    const paused=()=>{if(!repairing&&!video.ended&&!video.error&&video.readyState>=2)playbackIntent.current=false;};
    const progress=()=>{
      if(Math.abs(video.currentTime-lastTime)<0.05)return;
      lastTime=video.currentTime;lastAdvance=performance.now();softRecovery=false;reported=false;reportLoading(false);
      if(lastAdvance-stableSince>15000){mediaRecoveries=0;networkRecoveries=0;stableSince=lastAdvance;}
    };
    const waiting=()=>{if(playbackIntent.current&&video.readyState<3)reportLoading(true);};
    const error=()=>{if(!repairing)fail();};
    const online=()=>{if(playbackIntent.current&&performance.now()-lastAdvance>3000)fail();};
    video.addEventListener('playing',started);video.addEventListener('play',requestedPlay);video.addEventListener('pause',paused);
    video.addEventListener('timeupdate',progress);video.addEventListener('waiting',waiting);video.addEventListener('stalled',waiting);
    video.addEventListener('error',error);video.addEventListener('ended',fail);window.addEventListener('online',online);
    // Watching actual playback progress also catches streams that freeze without
    // emitting a fatal error. A user pause never triggers the watchdog.
    const watchdog=setInterval(()=>{
      if(!active||blocked||!playbackIntent.current)return;
      const stalledFor=performance.now()-lastAdvance;
      if(stalledFor>=15000){fail();return;}
      if(stalledFor>=8000&&!softRecovery){
        softRecovery=true;reportLoading(true);
        const live=hls?.liveSyncPosition??(video.seekable.length?video.seekable.end(video.seekable.length-1)-1:undefined);
        if(live!==undefined&&Number.isFinite(live)&&live>video.currentTime+1)try{video.currentTime=live;}catch{/* A refreshed playlist may be needed. */}
        hls?.startLoad(-1);play();
      }
    },1000);
    const nativeHls=Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
    // Android advertises native HLS, but its separate media loader can fail on
    // the local proxied playlists. Keep requests and recovery in the WebView.
    const preferHls=isAndroid||/Android/i.test(navigator.userAgent);
    const playNative=()=>{if(!active)return;if(!nativeHls){fail();return;}video.src=url;video.load();play();};
    if(nativeHls&&!preferHls)playNative();
    else void import('hls.js').then(({default:Hls})=>{
      if(!active)return;
      if(!Hls.isSupported()){playNative();return;}
      const limits=isWebOS?{maxBufferLength:15,maxMaxBufferLength:20,maxBufferSize:tvVideoBufferBytes,backBufferLength:0,enableWorker:false}
        :isAndroidTV||isAndroidArm32?{...androidHlsLimits,startLevel:0}:{maxBufferLength:30,backBufferLength:30};
      hls=new Hls({liveSyncDurationCount:3,liveMaxLatencyDurationCount:8,...limits});
      hls.on(Hls.Events.MANIFEST_PARSED,play);
      hls.on(Hls.Events.ERROR,(_,data)=>{
        if(!active||!data.fatal)return;
        reportLoading(true);
        if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaRecoveries++<1){repairing=true;hls?.recoverMediaError();}
        else if(data.type===Hls.ErrorTypes.NETWORK_ERROR&&networkRecoveries++<2)hls?.startLoad(-1);
        else fail();
      });
      hls.loadSource(url);hls.attachMedia(video);
    }).catch(fail);
    return()=>{
      active=false;clearInterval(watchdog);
      video.removeEventListener('playing',started);video.removeEventListener('play',requestedPlay);video.removeEventListener('pause',paused);
      video.removeEventListener('timeupdate',progress);video.removeEventListener('waiting',waiting);video.removeEventListener('stalled',waiting);
      video.removeEventListener('error',error);video.removeEventListener('ended',fail);window.removeEventListener('online',online);
      hls?.destroy();video.pause();video.removeAttribute('src');video.load();
    };
  },[url]);
  const video=<video ref={videoRef} className="live-tv-video" controls playsInline controlsList="nodownload" aria-label="Live TV video player" onVolumeChange={event=>savePlayerSettings({...playerSettings(),volume:event.currentTarget.volume,muted:event.currentTarget.muted})}/>;
  if(!isAndroid)return video;
  return <div className={expanded?'live-tv-android-player live-tv-expanded':'live-tv-android-player'}>
    {video}
    <button ref={fullscreenButton} type="button" className="button secondary live-tv-fullscreen" onClick={()=>void toggleFullscreen()} aria-label={expanded?'Exit fullscreen':'Enter fullscreen'} title={expanded?'Exit fullscreen':'Fullscreen'}>
      {expanded?<Minimize size={20}/>:<Maximize size={20}/>}
    </button>
  </div>;
}
