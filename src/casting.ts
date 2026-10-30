import {useEffect,useRef,useState} from 'react';
import {engineUrl} from './engine';

const CAST_SCRIPT='https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
const CAST_TIMEOUT=9000;
const LOOPBACK_HOSTS=new Set(['localhost','127.0.0.1','::1','0.0.0.0','[::1]']);
const MEDIA_TYPES:[RegExp,string][]=[
  [/\.m3u8$/i,'application/x-mpegURL'],
  [/\.mpd$/i,'application/dash+xml'],
  [/\.mp4$/i,'video/mp4'],
  [/\.m4v$/i,'video/mp4'],
  [/\.webm$/i,'video/webm'],
  [/\.mov$/i,'video/quicktime'],
  [/\.mkv$/i,'video/x-matroska'],
  [/\.avi$/i,'video/x-msvideo'],
];

type CastSession={loadMedia(request:unknown):Promise<void>;getCastDevice():{friendlyName?:string}|undefined};
type CastError={code?:string;description?:string};
type CastContext={
  setOptions(options:Record<string,unknown>):void;
  requestSession():Promise<CastSession>;
  getCurrentSession():CastSession|undefined;
  endCurrentSession(stopCasting:boolean):void;
  addEventListener(type:string,handler:(event:{castState?:string;session?:CastSession})=>void):void;
  removeEventListener(type:string,handler:(event:{castState?:string;session?:CastSession})=>void):void;
};
type CastApi={
  framework:{CastContext:{getInstance():CastContext}};
  chrome:{
    AutoJoinPolicy:{ORIGIN_SCOPED:string};
    media:{
      DEFAULT_MEDIA_RECEIVER_APP_ID:string;
      MediaInfo:new(url:string,contentType:string)=>any;
      GenericMediaMetadata:new()=>any;
      MetadataType:{GENERIC:string};
      StreamType:{BUFFERED:string};
      LoadRequest:new(mediaInfo:unknown)=>any;
    };
  };
};

declare global {
  interface Window {
    __onGCastApiAvailable?:(available:boolean)=>void;
    cast?:{framework?:CastApi['framework']};
    chrome?:{cast?:CastApi['chrome']};
  }
}

export type CastBackend='sdk'|'native'|'none';
export type CastDevice={id:string;name:string;model?:string};
export type CastStart={ok:boolean;device?:string;error?:string};
type NativeStatus={available?:boolean;active?:boolean;device?:CastDevice;cast?:{playerState?:string;currentTime?:number;duration?:number}};

let sdkPromise:Promise<CastApi>|undefined;
let lanCache:{at:number;origins:string[]}|undefined;

// Electron ships Chromium without the Google Cast media router, so the desktop app detects
// the engine's native Chromecast endpoint instead of waiting for cast_sender.js to fail.
function isElectron() {
  return typeof navigator!=='undefined'&&/Electron/i.test(navigator.userAgent);
}

export function castContentType(url:string) {
  let pathname=url;
  try {pathname=new URL(url).pathname;} catch {/* Keep the raw value for malformed or relative URLs. */}
  return MEDIA_TYPES.find(([pattern])=>pattern.test(pathname))?.[1]??'video/mp4';
}

export function isLoopbackMediaUrl(url:string) {
  try {return LOOPBACK_HOSTS.has(new URL(url).hostname.toLowerCase());} catch {return false;}
}

export function lanMediaUrl(url:string,lanOrigins:string[]) {
  const parsed=new URL(url);
  if(!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()))return parsed.href;
  const origin=lanOrigins.find(value=>{
    try {return ['http:','https:'].includes(new URL(value).protocol);} catch {return false;}
  });
  if(!origin)throw new Error('Casting a local stream needs the engine on this PC’s network. Start Hasimio Engine with LAN access, or open Hasimio from this PC’s LAN address.');
  return new URL(parsed.pathname+parsed.search+parsed.hash,origin).href;
}

export async function fetchLanOrigins(fetcher:typeof fetch=fetch) {
  if(lanCache&&Date.now()-lanCache.at<15000)return lanCache.origins;
  try {
    const response=await fetcher(engineUrl('/api/streaming/health'),{cache:'no-store',signal:AbortSignal.timeout(4000)});
    if(!response.ok)return [];
    const body=await response.json() as {lanOrigins?:unknown};
    const origins=Array.isArray(body.lanOrigins)?body.lanOrigins.filter((value):value is string=>typeof value==='string'&&/^https?:\/\//i.test(value)):[];
    lanCache={at:Date.now(),origins};
    return origins;
  } catch {return [];}
}

export async function castMediaUrl(url:string,fetcher:typeof fetch=fetch) {
  if(!isLoopbackMediaUrl(url))return new URL(url).href;
  return lanMediaUrl(url,await fetchLanOrigins(fetcher));
}

export function loadCastSdk() {
  if(window.cast?.framework&&window.chrome?.cast)return Promise.resolve({framework:window.cast.framework,chrome:window.chrome.cast});
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise<CastApi>((resolve,reject)=>{
    const script=document.createElement('script');
    const finish=(error?:Error)=>{
      clearTimeout(timer);
      if(error)reject(error);
      else if(window.cast?.framework&&window.chrome?.cast)resolve({framework:window.cast.framework,chrome:window.chrome.cast});
      else reject(new Error('Google Cast is unavailable in this browser.'));
    };
    const timer=setTimeout(()=>finish(new Error('Google Cast did not load. Check your connection and try again.')),CAST_TIMEOUT);
    window.__onGCastApiAvailable=available=>finish(available?undefined:new Error('Google Cast is unavailable in this browser.'));
    script.src=CAST_SCRIPT;
    script.async=true;
    script.onerror=()=>finish(new Error('Google Cast did not load. Check your connection and try again.'));
    document.head.append(script);
  }).catch(error=>{sdkPromise=undefined;throw error;});
  return sdkPromise;
}

export function castErrorMessage(error:unknown) {
  const value=error as CastError|undefined,code=String(value?.code??'');
  if(code==='cancel')return '';
  if(code==='no_devices'||code==='receiver_unavailable'||code==='timeout')return 'No Chromecast device was found. Make sure the TV is on the same Wi-Fi network and try again.';
  if(code==='load_failed'||code==='load_cancelled'||code==='invalid_request')return 'The TV could not play this source. Try a different quality or source.';
  return value?.description||(error instanceof Error?error.message:'Casting could not start.');
}

async function nativeRequest<T>(path:string,options?:RequestInit):Promise<T>{
  const response=await fetch(engineUrl(path),{cache:'no-store',...options});
  let body:any={};
  try {body=await response.json();} catch {/**/}
  if(!response.ok)throw new Error(typeof body?.error==='string'?body.error:'The local engine did not answer the casting request.');
  return body as T;
}

export function useChromecast({url,title,subtitle,position}:{url?:string;title:string;subtitle?:string;position:number}) {
  const [backend,setBackend]=useState<CastBackend>('none');
  const [status,setStatus]=useState<'loading'|'unavailable'|'ready'|'connecting'|'connected'>('loading');
  const [device,setDevice]=useState('');
  const [devices,setDevices]=useState<CastDevice[]>([]);
  const [scanning,setScanning]=useState(false);
  const [scanError,setScanError]=useState('');
  const context=useRef<CastContext|undefined>(undefined);
  const api=useRef<CastApi|undefined>(undefined);
  const startedHere=useRef(false);
  const mounted=useRef(true);
  const current=useRef({url,title,subtitle,position});
  current.current={url,title,subtitle,position};

  useEffect(()=>{
    mounted.current=true;
    let live=true;
    let poll:ReturnType<typeof setInterval>|undefined;
    let onCastState:(event:{castState?:string;session?:CastSession})=>void=()=>{};
    let onSession:(event:{castState?:string;session?:CastSession})=>void=()=>{};

    async function refreshNative() {
      try {
        const body=await nativeRequest<NativeStatus>('/api/cast/status');
        if(!live)return;
        if(body.available===false){setBackend('none');setStatus('unavailable');return;}
        if(body.active){setStatus('connected');setDevice(body.device?.name||'your TV');}
        else setStatus(previous=>previous==='connecting'?'connecting':'ready');
      } catch {
        if(live){setBackend('none');setStatus('unavailable');}
      }
    }
    async function useNative() {
      try {
        const body=await nativeRequest<{available?:boolean}>('/api/cast');
        if(!live)return;
        if(!body.available){setBackend('none');setStatus('unavailable');return;}
        setBackend('native');setStatus('ready');
        await refreshNative();
        if(live)poll=setInterval(()=>void refreshNative(),5000);
      } catch {
        if(live){setBackend('none');setStatus('unavailable');}
      }
    }

    if(isElectron()){
      void useNative();
    } else {
      loadCastSdk().then(value=>{
        if(!live)return;
        setBackend('sdk');
        api.current=value;
        const castContext=value.framework.CastContext.getInstance();
        const deviceName=(session?:CastSession)=>session?.getCastDevice()?.friendlyName||'your TV';
        castContext.setOptions({receiverApplicationId:value.chrome.media.DEFAULT_MEDIA_RECEIVER_APP_ID,autoJoinPolicy:value.chrome.AutoJoinPolicy.ORIGIN_SCOPED});
        context.current=castContext;
        const session=castContext.getCurrentSession();
        setStatus(session?'connected':'ready');
        if(session)setDevice(deviceName(session));
        onCastState=event=>{
          if(event.castState==='CONNECTED'){setStatus('connected');setDevice(deviceName(castContext.getCurrentSession()));}
          else if(event.castState==='CONNECTING')setStatus('connecting');
          else setStatus(previous=>previous==='connected'||previous==='connecting'?'ready':previous);
        };
        onSession=event=>{
          if(event.session){setStatus('connected');setDevice(deviceName(event.session));}
          else{startedHere.current=false;setStatus('ready');setDevice('');}
        };
        castContext.addEventListener('caststatechanged',onCastState);
        castContext.addEventListener('sessionstatechanged',onSession);
      }).catch(()=>void useNative());
    }

    return()=>{
      live=false;mounted.current=false;
      if(poll)clearInterval(poll);
      if(context.current){
        context.current.removeEventListener('caststatechanged',onCastState);
        context.current.removeEventListener('sessionstatechanged',onSession);
        // Closing the player stops a cast started here; a session joined from another tab keeps running.
        if(startedHere.current&&context.current.getCurrentSession())context.current.endCurrentSession(true);
      }
      // Native casts do not belong to a browser session, so stop them explicitly when this player started them.
      if(startedHere.current)void fetch(engineUrl('/api/cast/stop'),{method:'POST',keepalive:true}).catch(()=>{});
    };
  },[]);

  async function start(deviceId?:string):Promise<CastStart> {
    const media=current.current;
    if(!media.url)return {ok:false,error:'This source cannot be cast.'};
    if(backend==='native'){
      if(!deviceId)return {ok:false,error:'Choose a TV first.'};
      setStatus('connecting');
      try {
        const result=await nativeRequest<{device?:CastDevice}>('/api/cast/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,url:media.url,title:media.title,subtitle:media.subtitle,contentType:castContentType(media.url),position:Math.max(0,media.position||0)})});
        if(!mounted.current)return {ok:true,device:result.device?.name};
        startedHere.current=true;setStatus('connected');
        const name=result.device?.name||'your TV';setDevice(name);
        return {ok:true,device:name};
      } catch(error) {
        if(mounted.current)setStatus('ready');
        return {ok:false,error:castErrorMessage(error)};
      }
    }
    const castContext=context.current,castApi=api.current;
    if(!castContext||!castApi)return {ok:false,error:'Casting is still loading. Try again in a moment.'};
    setStatus('connecting');
    try{
      const target=await castMediaUrl(media.url);
      const session=castContext.getCurrentSession()??await castContext.requestSession();
      const mediaInfo=new castApi.chrome.media.MediaInfo(target,castContentType(target));
      const metadata=new castApi.chrome.media.GenericMediaMetadata();
      metadata.metadataType=castApi.chrome.media.MetadataType.GENERIC;
      metadata.title=media.title;
      if(media.subtitle)metadata.subtitle=media.subtitle;
      mediaInfo.metadata=metadata;
      mediaInfo.streamType=castApi.chrome.media.StreamType.BUFFERED;
      const request=new castApi.chrome.media.LoadRequest(mediaInfo);
      request.currentTime=Math.max(0,media.position||0);
      await session.loadMedia(request);
      startedHere.current=true;
      setStatus('connected');
      const name=session.getCastDevice()?.friendlyName||'your TV';
      setDevice(name);
      return {ok:true,device:name};
    }catch(error){
      const message=castErrorMessage(error);
      setStatus(castContext.getCurrentSession()?'connected':'ready');
      return {ok:false,error:message||undefined};
    }
  }

  async function refreshDevices() {
    if(backend!=='native')return;
    setScanning(true);setScanError('');
    try {
      const body=await nativeRequest<{devices?:CastDevice[]}>('/api/cast/devices?refresh=1');
      if(!mounted.current)return;
      setDevices(Array.isArray(body.devices)?body.devices.filter(item=>typeof item?.id==='string'&&typeof item?.name==='string'):[]);
    } catch(error) {
      if(!mounted.current)return;
      setDevices([]);setScanError(castErrorMessage(error));
    } finally {
      if(mounted.current)setScanning(false);
    }
  }

  function stop(){
    startedHere.current=false;
    if(backend==='native'){
      setStatus('ready');setDevice('');
      void fetch(engineUrl('/api/cast/stop'),{method:'POST'}).catch(()=>{});
      return;
    }
    if(!context.current)return;
    context.current.endCurrentSession(true);
    setStatus('ready');
    setDevice('');
  }

  const available=backend==='native'||(backend==='sdk'&&status!=='loading'&&status!=='unavailable');
  return {available,active:status==='connected',busy:status==='connecting',device,devices,scanning,scanError,backend,start,stop,refreshDevices};
}
