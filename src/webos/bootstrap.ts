import 'core-js/actual/object/has-own';
import 'core-js/actual/array/at';
import 'core-js/actual/string/replace-all';
import 'core-js/actual/promise/any';
import dialogPolyfill from 'dialog-polyfill';
import 'dialog-polyfill/dist/dialog-polyfill.css';
import {bridge} from './platform';
import './tv.css';

// Vite handles syntax for Chromium 79. These newer web APIs need runtime
// fallbacks too; merely lowering the JavaScript build target is insufficient.
if(!AbortSignal.timeout)AbortSignal.timeout=milliseconds=>{
  const controller=new AbortController();setTimeout(()=>controller.abort(),milliseconds);return controller.signal;
};
if(!AbortSignal.any)AbortSignal.any=signals=>{
  const controller=new AbortController();
  const abort=()=>{signals.forEach(signal=>signal.removeEventListener('abort',abort));controller.abort();};
  signals.forEach(signal=>signal.addEventListener('abort',abort,{once:true}));
  if(signals.some(signal=>signal.aborted))abort();
  return controller.signal;
};
if(!crypto.randomUUID)crypto.randomUUID=()=>{
  const data=crypto.getRandomValues(new Uint8Array(16));data[6]=data[6]&15|64;data[8]=data[8]&63|128;
  const hex=Array.from(data,value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
};

// Serve the UI on loopback so Web Crypto, storage and all engine routes share
// a secure-context origin. The service never binds to the home network.
const keepAlive=bridge();
if(keepAlive){keepAlive.onservicecallback=()=>{};keepAlive.call('luna://app.hasimio.tv.service/start',JSON.stringify({subscribe:true}));}
const nativeFetch=window.fetch.bind(window);
window.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  // Extension HTTP APIs go through the TV service, avoiding browser CORS and
  // old browser certificate stores. Video/image resources remain native URLs.
  if(url.origin!==location.origin&&['http:','https:'].includes(url.protocol)&&!new Headers(options?.headers??(input instanceof Request?input.headers:undefined)).has('Authorization')&&(options?.method??(input instanceof Request?input.method:'GET')).toUpperCase()==='GET'){
    return nativeFetch('/api/webos/fetch?url='+encodeURIComponent(url.href),{signal:options?.signal,cache:'no-store'});
  }
  return nativeFetch(input,options);
};

function registerDialogs(node:ParentNode){node.querySelectorAll('dialog').forEach(dialog=>dialogPolyfill.registerDialog(dialog));}
registerDialogs(document);
new MutationObserver(entries=>entries.forEach(entry=>entry.addedNodes.forEach(node=>{if(node instanceof HTMLElement){if(node.tagName==='DIALOG')dialogPolyfill.registerDialog(node as HTMLDialogElement);registerDialogs(node);}}))).observe(document.documentElement,{childList:true,subtree:true});

document.documentElement.classList.add('hasimio-tv');
// Native lazy loading keeps decoded artwork only around visible shelves.
// Explicit pagination prevents a long session accumulating an unlimited DOM.
const focusable='button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]';
function scope(){return document.querySelector<HTMLElement>('.cinema-menu')??document.querySelector<HTMLElement>('.cinema-player')??document.querySelector<HTMLDialogElement>('dialog[open]')??document;}
function candidates(){return Array.from(scope().querySelectorAll<HTMLElement>(focusable)).filter(element=>element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden'&&!element.closest('[hidden],[aria-hidden="true"]'));}
document.addEventListener('keydown',event=>{
  const back=event.key==='Escape'||event.key==='GoBack'||event.keyCode===461;
  if(back){
    const player=document.querySelector<HTMLButtonElement>('.cinema-menu .cinema-menu-header button')??document.querySelector<HTMLButtonElement>('.cinema-back');
    if(player){event.preventDefault();event.stopImmediatePropagation();player.click();return;}
    const dialog=document.querySelector<HTMLDialogElement>('dialog[open]');
    if(dialog){event.preventDefault();dialog.dispatchEvent(new Event('cancel',{cancelable:true}));return;}
    const search=document.querySelector<HTMLInputElement>('.search input');
    if(search?.value){event.preventDefault();search.focus();return;}
    const home=Array.from(document.querySelectorAll<HTMLButtonElement>('nav button')).find(button=>button.textContent?.includes('Discover'));
    if(home&&!home.classList.contains('active')){event.preventDefault();home.click();return;}
    // At the root, let webOS handle Back and exit normally.
    return;
  }
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
  const active=document.activeElement as HTMLElement;
  if(active?.matches('input,textarea,select'))return;
  const list=candidates();
  if(!list.length)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!active||!list.includes(active)){list[0].focus();return;}
  const origin=active.getBoundingClientRect(),x=origin.left+origin.width/2,y=origin.top+origin.height/2;
  const horizontal=event.key==='ArrowLeft'||event.key==='ArrowRight',positive=event.key==='ArrowRight'||event.key==='ArrowDown';
  let target:HTMLElement|undefined,best=Infinity;
  for(const element of list){
    if(element===active)continue;
    const rect=element.getBoundingClientRect(),dx=rect.left+rect.width/2-x,dy=rect.top+rect.height/2-y;
    const forward=(horizontal?dx:dy)*(positive?1:-1),side=Math.abs(horizontal?dy:dx);
    if(forward<=4)continue;
    const score=forward+side*3;
    if(score<best){best=score;target=element;}
  }
  target?.focus();target?.scrollIntoView({block:'nearest',inline:'nearest'});
},true);
const stop=()=>{void nativeFetch('/api/webos/stop',{method:'POST',keepalive:true});};
window.addEventListener('pagehide',()=>{stop();keepAlive?.cancel?.();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){document.querySelector<HTMLButtonElement>('.cinema-back')?.click();stop();}});

// Two MiB for disposable persisted metadata. Library, progress and pairing
// credentials are never evicted to make room for caches.
const disposable=['hasimio:progress-metadata:v1','hasimio:verified-tracks'];
const setItem=Storage.prototype.setItem;
Storage.prototype.setItem=function(key,value){
  if(this===localStorage&&disposable.includes(key)&&new Blob([String(value)]).size>1024*1024)return;
  try{setItem.call(this,key,value);}catch(error){
    if(this!==localStorage)throw error;
    disposable.forEach(item=>{if(item!==key)localStorage.removeItem(item);});
    try{setItem.call(this,key,value);}catch(retry){window.dispatchEvent(new Event('hasimio:storage-full'));throw retry;}
  }
};
