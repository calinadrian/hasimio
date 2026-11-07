import type {UpdateState} from '../DesktopUpdates';
document.documentElement.classList.add('hasimio-android');
if(import.meta.env.VITE_ANDROID_ARM32==='true')document.documentElement.classList.add('hasimio-android-arm32');

type NativeBridge={isTelevision?():boolean;state():string;check():void;install():void};
const native=(window as unknown as {HasimioAndroid:NativeBridge}).HasimioAndroid;
if(native.isTelevision?.()){
  document.documentElement.classList.add('hasimio-android-tv');
  void import('./remote');
}
const listeners=new Set<(state:UpdateState)=>void>();
Object.assign(window,{
  hasimioAndroid:true,
  hasimioDesktop:{
    getUpdate:async()=>JSON.parse(native.state()) as UpdateState,
    checkForUpdates:async()=>{native.check();return JSON.parse(native.state()) as UpdateState;},
    installUpdate:async()=>native.install(),
    onUpdate:(listener:(state:UpdateState)=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},
  },
  hasimioAndroidUpdate:(state:UpdateState)=>listeners.forEach(listener=>listener(state)),
});
// Use the same bounded on-device engine as the TV, with the mobile layout.
// JSON extension requests go through the local engine to avoid WebView CORS.
const originalFetch=window.fetch.bind(window);
window.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  const headers=new Headers(options?.headers??(input instanceof Request?input.headers:undefined));
  if(url.origin!==location.origin&&['http:','https:'].includes(url.protocol)&&!headers.has('Authorization')&&(options?.method??(input instanceof Request?input.method:'GET')).toUpperCase()==='GET'){
    return originalFetch('/api/webos/fetch?url='+encodeURIComponent(url.href),{signal:options?.signal,cache:'no-store'});
  }
  return originalFetch(input,options);
};
Object.assign(window,{hasimioAndroidBack:()=>{
  const fullscreen=document.querySelector<HTMLButtonElement>('.live-tv-expanded .live-tv-fullscreen');
  if(fullscreen){fullscreen.click();return true;}
  const editor=document.activeElement;
  if(document.documentElement.classList.contains('hasimio-android-tv')&&editor instanceof HTMLInputElement&&editor.matches('.search input')){editor.blur();document.querySelector<HTMLButtonElement>('nav button.active')?.focus();return true;}
  const close=document.querySelector<HTMLButtonElement>('.cinema-menu .cinema-menu-header button,.cinema-back');
  if(close){close.click();return true;}
  const dialog=document.querySelector('dialog[open]');
  if(dialog){dialog.dispatchEvent(new Event('cancel',{cancelable:true}));return true;}
  const back=document.querySelector<HTMLButtonElement>('.shelf-back,.profile-back');
  if(back){back.click();return true;}
  return false;
}});
void import('../main');
