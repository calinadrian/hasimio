// A tiny heartbeat lets the PC monitor distinguish a healthy service from a
// stalled interface/player. It never includes video URLs, titles or tokens.
export function startTelemetry(nativeFetch:typeof window.fetch){
  let sending=false,lastError=0;
  function send(value:object){
    return nativeFetch('/api/webos/monitor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(5000)}).catch(()=>undefined);
  }
  function heartbeat(){
    if(sending)return;
    sending=true;
    const video=document.querySelector<HTMLVideoElement>('video');
    void send({kind:'heartbeat',visible:!document.hidden,video:video?{
      paused:video.paused,ended:video.ended,currentTime:video.currentTime,
      readyState:video.readyState,errorCode:video.error?.code??0
    }:undefined}).finally(()=>{sending=false;});
  }
  function error(kind:string,message:string){
    if(Date.now()-lastError<2000)return;
    lastError=Date.now();void send({kind,message:message.slice(0,180)});
  }
  window.addEventListener('error',event=>error('ui-error',event.message||'The TV interface could not load a resource.'));
  window.addEventListener('unhandledrejection',event=>error('ui-rejection',event.reason instanceof Error?event.reason.message:'An unhandled interface rejection occurred.'));
  document.addEventListener('error',event=>{if(event.target instanceof HTMLVideoElement)error('video-error','Native video error '+(event.target.error?.code??0));},true);
  document.addEventListener('visibilitychange',heartbeat);
  heartbeat();setInterval(heartbeat,10000);
}
