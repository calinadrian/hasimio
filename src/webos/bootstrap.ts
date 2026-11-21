import 'core-js/actual/object/has-own';
import 'core-js/actual/array/at';
import 'core-js/actual/string/replace-all';
import 'core-js/actual/promise/any';
import dialogPolyfill from 'dialog-polyfill';
import 'dialog-polyfill/dist/dialog-polyfill.css';
import {bridge} from './platform';
import {startTelemetry} from './telemetry';
import {logicalStorageKey} from '../profile-storage';
import {pickTarget,type Direction} from './spatial';
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
startTelemetry(nativeFetch);
window.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  // Extension HTTP APIs go through the TV service, avoiding browser CORS and
  // old browser certificate stores. Video/image resources remain native URLs.
  if(options?.mode!=='cors'&&url.origin!==location.origin&&['http:','https:'].includes(url.protocol)&&!new Headers(options?.headers??(input instanceof Request?input.headers:undefined)).has('Authorization')&&(options?.method??(input instanceof Request?input.method:'GET')).toUpperCase()==='GET'){
    return nativeFetch('/api/webos/fetch?url='+encodeURIComponent(url.href),{signal:options?.signal,cache:'no-store'});
  }
  // webOS 6 rejects every keepalive request outright ("Failed to fetch"), so
  // the player's stop request never reached the service and a closed torrent
  // kept downloading in the background. Send these as ordinary requests.
  return nativeFetch(input,options?.keepalive?{...options,keepalive:false}:options);
};

function registerDialogs(node:ParentNode){node.querySelectorAll('dialog').forEach(dialog=>dialogPolyfill.registerDialog(dialog));}
registerDialogs(document);
new MutationObserver(entries=>entries.forEach(entry=>entry.addedNodes.forEach(node=>{if(node instanceof HTMLElement){if(node.tagName==='DIALOG')dialogPolyfill.registerDialog(node as HTMLDialogElement);registerDialogs(node);}}))).observe(document.documentElement,{childList:true,subtree:true});

document.documentElement.classList.add('hasimio-tv');
// Chromium 79 (webOS 6) ignores `gap` on flex containers. The TV build emits
// margin fallbacks scoped to this class; newer TVs keep native flex gap.
(function detectFlexGap(){
  const probe=document.createElement('div');
  probe.style.cssText='display:flex;flex-direction:column;gap:1px;position:absolute;visibility:hidden';
  probe.appendChild(document.createElement('div'));probe.appendChild(document.createElement('div'));
  document.documentElement.appendChild(probe);
  if(probe.scrollHeight!==1)document.documentElement.classList.add('no-flex-gap');
  probe.remove();
})();
// CSS cannot see bare text, so the flex-gap fallback cannot space label text
// from a neighbouring icon or badge ("(i) Details", "Top 100 [82]"). Mark
// elements that sit directly before or after label text; data attributes
// survive React re-rendering className.
if(document.documentElement.classList.contains('no-flex-gap')){
  const filled=(node:Node|null)=>!!node&&node.nodeType===3&&!!node.textContent?.trim();
  const meaningful=(node:Node|null,step:'previousSibling'|'nextSibling')=>{while(node&&node.nodeType===3&&!node.textContent?.trim())node=node[step];return node;};
  const markChildren=(parent:Element|null)=>{
    if(!parent||parent.closest('svg'))return;
    for(const child of Array.from(parent.children)){
      child.toggleAttribute('data-after-text',filled(meaningful(child.previousSibling,'previousSibling')));
      child.toggleAttribute('data-before-text',filled(meaningful(child.nextSibling,'nextSibling')));
    }
  };
  const textParents=(root:Node)=>{
    const parents=new Set<Element>();
    if(root.nodeType===3){if(root.parentElement)parents.add(root.parentElement);return parents;}
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode())if(node.textContent?.trim()&&node.parentElement)parents.add(node.parentElement);
    return parents;
  };
  textParents(document.body).forEach(markChildren);
  new MutationObserver(entries=>{
    const parents=new Set<Element>();
    entries.forEach(entry=>{
      if(entry.type==='characterData'){if(entry.target.parentElement)parents.add(entry.target.parentElement);return;}
      if(entry.target instanceof Element)parents.add(entry.target);
      entry.addedNodes.forEach(node=>textParents(node).forEach(parent=>parents.add(parent)));
    });
    parents.forEach(markChildren);
  }).observe(document.body,{childList:true,subtree:true,characterData:true});
}
// Native lazy loading keeps decoded artwork only around visible shelves.
// Explicit pagination prevents a long session accumulating an unlimited DOM.
const focusable='button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]';
function scope(){return document.querySelector<HTMLElement>('.tv-select')??document.querySelector<HTMLElement>('.cinema-menu')??document.querySelector<HTMLElement>('.cinema-player')??document.querySelector<HTMLDialogElement>('dialog[open]')??document;}
function candidates(){return Array.from(scope().querySelectorAll<HTMLElement>(focusable)).filter(element=>element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden'&&!element.closest('[hidden],[aria-hidden="true"]'));}
const editing='input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]),textarea,select';
let previousControl:HTMLElement|undefined;
let keyboardVisible=false;
// The native keyboard consumes Back itself, so our keydown handler may never
// receive that press. Track its visibility instead of equating focus with editing.
document.addEventListener('keyboardStateChange',event=>{
  keyboardVisible=Boolean((event as CustomEvent<{visibility:boolean}>).detail?.visibility);
});
let lastFocus:{x:number;y:number}|undefined;
document.addEventListener('focusin',event=>{
  const element=event.target;
  if(element instanceof HTMLElement){const r=element.getBoundingClientRect();lastFocus={x:r.left+r.width/2,y:r.top+r.height/2};}
  if(element instanceof HTMLElement&&!element.matches(editing))previousControl=element;
  // webOS opens its keyboard whenever a text field gains focus. Arriving on a
  // field with the remote only highlights it: it stays read-only (no
  // keyboard) until OK is pressed.
  if(element instanceof HTMLInputElement&&element.matches(editing)&&!element.readOnly&&element.dataset.tvTyping!=='1'){
    element.readOnly=true;element.dataset.tvLocked='1';
  }
});
let reopening:HTMLInputElement|undefined;
document.addEventListener('focusout',event=>{
  const element=event.target;
  // Leaving a field locks it again for the next remote visit; the blur that
  // reopens the keyboard is not a real exit.
  if(element instanceof HTMLInputElement&&element.dataset.tvTyping==='1'&&element!==reopening)delete element.dataset.tvTyping;
});
// OK (or a Magic Remote click) on a highlighted field unlocks it and opens the keyboard.
function startTyping(input:HTMLInputElement){
  if(input.dataset.tvLocked==='1'){input.readOnly=false;delete input.dataset.tvLocked;}
  input.dataset.tvTyping='1';reopening=input;
  input.blur();setTimeout(()=>{input.focus();reopening=undefined;},0);
}
// The main search opens Hasimio's own keyboard (SearchKeyboard.tsx) instead of
// the webOS one; other fields (settings, extension links) keep the webOS keyboard.
function openSearchKeyboard(){document.dispatchEvent(new CustomEvent('hasimio:search-keyboard'));}
document.addEventListener('click',event=>{
  const input=event.target;
  if(input instanceof HTMLInputElement&&input.dataset.tvLocked==='1'){
    if(input.closest('.search')){event.preventDefault();openSearchKeyboard();return;}
    startTyping(input);
  }
},true);
function leaveEditor(element:HTMLElement){
  // Blurring dismisses the LG keyboard. Return to a real control so the next
  // remote arrow moves through results instead of editing the search text.
  element.blur();
  const list=candidates().filter(control=>!control.matches(editing)&&!control.closest('.search'));
  const target=previousControl&&list.includes(previousControl)?previousControl:list.find(control=>control.matches('.poster-card'))??list[0];
  target?.focus();
  if(target)reveal(target);
}

// Dropdowns: the webOS popup opens below the control and runs off the bottom
// of the screen for anything low on the page, where the remote cannot reach
// its options. OK (or a pointer click) opens this centred list instead; the
// choice is written back to the <select> and announced with a change event.
function openSelect(select:HTMLSelectElement){
  closeSelect();
  const layer=document.createElement('div');layer.className='tv-select';layer.setAttribute('role','dialog');
  const panel=document.createElement('div');panel.className='tv-select-panel';
  const label=(select.getAttribute('aria-label')||select.closest('label')?.firstChild?.textContent||'').trim();
  if(label){const heading=document.createElement('h3');heading.textContent=label;panel.appendChild(heading);}
  const list=document.createElement('div');list.className='tv-select-list';list.setAttribute('role','listbox');
  for(const option of Array.from(select.options)){
    if(option.hidden)continue;
    const choice=document.createElement('button');choice.type='button';choice.className='tv-select-option'+(option.selected?' selected':'');
    choice.textContent=option.textContent;choice.disabled=option.disabled;choice.setAttribute('role','option');choice.setAttribute('aria-selected',String(option.selected));
    choice.addEventListener('click',()=>{
      closeSelect();
      if(select.value!==option.value){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}
    });
    list.appendChild(choice);
  }
  panel.appendChild(list);layer.appendChild(panel);
  layer.addEventListener('click',event=>{if(event.target===layer)closeSelect();});
  openedSelect=select;
  // Inside an open dialog the list must join it in the top layer to show above it.
  (select.closest('dialog')??document.body).appendChild(layer);
  const current=list.querySelector<HTMLElement>('.selected:not(:disabled)')??list.querySelector<HTMLElement>('button:not(:disabled)');
  current?.focus();current?.scrollIntoView({block:'center'});
}
let openedSelect:HTMLSelectElement|undefined;
function closeSelect(){
  const layer=document.querySelector('.tv-select');if(!layer)return;
  layer.remove();const select=openedSelect;openedSelect=undefined;
  if(select?.isConnected)select.focus({preventScroll:true});
}
document.addEventListener('mousedown',event=>{
  const select=event.target instanceof HTMLSelectElement?event.target:undefined;
  if(select&&!select.multiple&&!select.disabled){event.preventDefault();select.focus({preventScroll:true});openSelect(select);}
},true);

document.addEventListener('keydown',event=>{
  // Leave native keyboard navigation to webOS while it is actually visible.
  if(keyboardVisible)return;
  if(event.key==='Enter'&&document.activeElement instanceof HTMLSelectElement&&!document.activeElement.multiple){
    event.preventDefault();event.stopImmediatePropagation();openSelect(document.activeElement);return;
  }
  const editorInput=document.activeElement instanceof HTMLInputElement&&document.activeElement.matches(editing)?document.activeElement:undefined;
  if(editorInput&&event.key==='Enter'){
    event.preventDefault();event.stopImmediatePropagation();
    if(editorInput.closest('.search')){openSearchKeyboard();return;}
    startTyping(editorInput);return;
  }
  const back=event.key==='Escape'||event.key==='GoBack'||event.keyCode===461;
  if(back){
    if(document.querySelector('.tv-select')){event.preventDefault();event.stopImmediatePropagation();closeSelect();return;}
    const active=document.activeElement;
    if(active instanceof HTMLElement&&active.matches(editing)){
      event.preventDefault();event.stopImmediatePropagation();leaveEditor(active);return;
    }
    const player=document.querySelector<HTMLButtonElement>('.cinema-menu .cinema-menu-header button')??document.querySelector<HTMLButtonElement>('.cinema-back');
    if(player){event.preventDefault();event.stopImmediatePropagation();player.click();return;}
    const dialog=document.querySelector<HTMLDialogElement>('dialog[open]');
    if(dialog){event.preventDefault();event.stopImmediatePropagation();dialog.dispatchEvent(new Event('cancel',{cancelable:true}));return;}
    // The search keyboard: Back from the results returns to it; Back on it closes it.
    const keyboard=document.querySelector<HTMLElement>('.tv-keyboard');
    if(keyboard){
      event.preventDefault();event.stopImmediatePropagation();
      if(keyboard.contains(document.activeElement)){keyboard.querySelector<HTMLButtonElement>('[data-keyboard-done]')?.click();return;}
      const key=keyboard.querySelector<HTMLElement>('[data-last]')??keyboard.querySelector<HTMLElement>('.tv-key');
      key?.focus();if(key)reveal(key);return;
    }
    const search=document.querySelector<HTMLInputElement>('.search input');
    if(search?.value){
      event.preventDefault();event.stopImmediatePropagation();
      document.querySelector<HTMLButtonElement>('.search button[aria-label="Clear search"]')?.click();
      document.querySelector<HTMLButtonElement>('nav button.active')?.focus();return;
    }
    const shelfBack=document.querySelector<HTMLButtonElement>('.shelf-back');
    if(shelfBack){event.preventDefault();event.stopImmediatePropagation();shelfBack.click();return;}
    const profileBack=document.querySelector<HTMLButtonElement>('.profile-back');
    if(profileBack){event.preventDefault();event.stopImmediatePropagation();profileBack.click();return;}
    // Down in Discover's rows, Back first returns to the top, as on Netflix; at the top it exits.
    if(document.querySelector('nav button.active')?.textContent?.includes('Discover')&&window.scrollY>40){
      event.preventDefault();event.stopImmediatePropagation();
      window.scrollTo(0,0);
      const top=document.querySelector<HTMLElement>('.hero.tv-spotlight .button.primary')??candidates().find(element=>element.matches('.poster-card'));
      top?.focus({preventScroll:true});return;
    }
    const home=Array.from(document.querySelectorAll<HTMLButtonElement>('nav button')).find(button=>button.textContent?.includes('Discover'));
    if(home&&!home.classList.contains('active')){event.preventDefault();event.stopImmediatePropagation();home.click();home.focus();return;}
    // At the root, let webOS handle Back and exit normally.
    return;
  }
  // OK on the remote sends Enter, which does not toggle checkboxes in Chromium.
  if(event.key==='Enter'&&document.activeElement instanceof HTMLInputElement&&['checkbox','radio'].includes(document.activeElement.type)){
    event.preventDefault();event.stopImmediatePropagation();document.activeElement.click();return;
  }
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
  const active=document.activeElement as HTMLElement;
  // Sliders keep Left/Right for their value; Up/Down always move focus, so a
  // slider can never trap the remote. Checkboxes and closed selects would
  // otherwise swallow every arrow (or silently change value) as well.
  if(active?.matches('input[type="range"]')&&(event.key==='ArrowLeft'||event.key==='ArrowRight'))return;
  if(active?.matches('textarea')&&!editorInput)return;
  const list=candidates();
  if(!list.length)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!active||!list.includes(active)){
    // In the player, the first press lands on Play/Pause rather than the Back
    // arrow in the corner.
    const play=document.querySelector<HTMLElement>('.cinema-player .cinema-play');
    if(play&&list.includes(play)){play.focus();return;}
    // Focus was lost (the focused control was removed, e.g. a shelf page
    // swap): resume at the control nearest to where it was, not the top-left.
    const last=lastFocus;
    const resume=last?list.reduce<{element?:HTMLElement;distance:number}>((best,element)=>{const r=element.getBoundingClientRect(),d=Math.hypot(r.left+r.width/2-last.x,r.top+r.height/2-last.y);return d<best.distance?{element,distance:d}:best;},{distance:Infinity}).element:undefined;
    (resume??list[0]).focus();return;
  }
  // Within a row, Left/Right step to the neighbouring poster even when it has
  // slid out of view (rows keep focus at their left edge); only the first
  // poster's Left reaches the menu, and the last one's Right loads the next page.
  if((event.key==='ArrowLeft'||event.key==='ArrowRight')&&active.matches('.poster-card')){
    const row=active.closest<HTMLElement>('.poster-row:not(.wrap)');
    if(row){
      const cards=Array.from(row.querySelectorAll<HTMLElement>('.poster-card'));
      const neighbour=cards[cards.indexOf(active)+(event.key==='ArrowRight'?1:-1)];
      if(neighbour){neighbour.focus();reveal(neighbour);return;}
      if(event.key==='ArrowRight'){active.dispatchEvent(new CustomEvent('hasimio:edge',{bubbles:true,detail:event.key}));return;}
    }
  }
  const pick=(controls:HTMLElement[])=>pickTarget(active.getBoundingClientRect(),event.key as Direction,controls.filter(element=>element!==active).map(element=>({item:element,box:element.getBoundingClientRect(),slider:element.matches('input[type="range"]')})),!!active.closest('.sidebar'));
  // The sticky search bar and the fixed sidebar stay on screen while rows
  // scroll away, so Up/Down would jump into them from anywhere. Up and Down
  // stay in the page: the sidebar is reached only with Left, and the search
  // bar only with Up once nothing in the page is above. At the end of the
  // page Down simply stays put.
  const vertical=event.key==='ArrowUp'||event.key==='ArrowDown';
  const fixed='.topbar,.sidebar';
  // From a poster, Up/Down go straight to the poster row above or below
  // rather than stopping on each shelf heading in between.
  const inPage=list.filter(element=>!element.closest(fixed));
  // Leaving the menu (Right) or the search bar (Down) goes into the page:
  // the menu's top item sits level with the search bar, so plain geometry
  // bounced between the two.
  const leaving=(event.key==='ArrowRight'&&active.closest('.sidebar'))||(event.key==='ArrowDown'&&active.closest('.topbar'));
  let target=leaving?pick(list.filter(element=>!element.closest(fixed)))??pick(list.filter(element=>!element.closest(active.closest('.sidebar')?'.topbar':'.sidebar')))
    :vertical&&active.closest('.sidebar')?pick(list.filter(element=>element.closest('.sidebar')))
    :vertical&&!active.closest(fixed)
    ?(active.matches('.poster-card')?pick(inPage.filter(element=>element.matches('.poster-card'))):undefined)
      // The Discover spotlight stays pinned on screen while the rows above
      // scroll beneath it, so its buttons always look nearest: Up from a
      // heading jumped straight to Resume, skipping rows. They are reached
      // only once nothing else in the page lies that way.
      ??pick(inPage.filter(element=>!element.closest('.hero.tv-spotlight')))
      ??pick(inPage)??(event.key==='ArrowUp'?pick(list.filter(element=>element.closest('.topbar'))):undefined)
    :pick(list);
  // Up from the search bar with nothing above stays put (it used to drop back
  // into the page, so Up bounced between the bar and the spotlight).
  if(!target&&editorInput){if(event.key!=='ArrowUp')leaveEditor(editorInput);return;}
  // Nothing further that way: let the control's container react (a shelf
  // loads its next page when Right is pressed on its last poster).
  if(!target)active.dispatchEvent(new CustomEvent('hasimio:edge',{bubbles:true,detail:event.key}));
  if(!target&&event.key==='ArrowDown'&&scope()===document)window.scrollBy(0,Math.round(window.innerHeight*.4));
  // Entering the collapsed rail lands on the current page, not on whichever
  // icon happens to be level with the previous control.
  if(target&&target.closest('.sidebar')&&!active.closest('.sidebar')){
    const current=document.querySelector<HTMLElement>('.sidebar .nav-item.active');
    if(current&&list.includes(current))target=current;
  }
  target?.focus();if(target)reveal(target);
},true);
// Brings a remote-focused control into view. On the Discover home the
// spotlight (Hero.tsx) stays pinned at the top: a focused poster's shelf sits
// right beneath it, as on Netflix, and its buttons return the page to the top.
function reveal(target:HTMLElement){
  target.scrollIntoView({block:'nearest',inline:'nearest'});
  // Rows keep the focused poster at their left edge and slide beneath it, as
  // on Netflix; each row stays where it was left, so Up/Down return to it.
  const row=target.matches('.poster-card')?target.closest<HTMLElement>('.poster-row:not(.wrap)'):null;
  const first=row?.querySelector<HTMLElement>('.poster-card');
  if(row&&first)row.scrollLeft=target.offsetLeft-first.offsetLeft;
  const spotlight=document.querySelector<HTMLElement>('.hero.tv-spotlight');
  if(!spotlight||target.closest('dialog'))return;
  if(spotlight.contains(target)){window.scrollTo(0,0);return;}
  if(target.closest('.topbar,.sidebar'))return;
  const shelf=target.closest<HTMLElement>('.media-shelf')??target;
  window.scrollBy(0,shelf.getBoundingClientRect().top-spotlight.offsetHeight-8);
}
// keepalive fetches fail on this browser. Send a beacon, which can still leave
// while the app closes, and an ordinary request too; stopping twice is harmless.
const stop=()=>{try{navigator.sendBeacon?.('/api/webos/stop');}catch{/* Beacons unavailable. */}void nativeFetch('/api/webos/stop',{method:'POST'}).catch(()=>{});};
window.addEventListener('pagehide',()=>{stop();keepAlive?.cancel?.();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){document.querySelector<HTMLButtonElement>('.cinema-back')?.click();stop();}});

// Two MiB for disposable persisted metadata. Library, progress and pairing
// credentials are never evicted to make room for caches.
const disposable=['hasimio:progress-metadata:v1','hasimio:verified-tracks'];
const setItem=Storage.prototype.setItem;
Storage.prototype.setItem=function(key,value){
  if(this===localStorage&&disposable.includes(logicalStorageKey(String(key)))&&new Blob([String(value)]).size>1024*1024)return;
  try{setItem.call(this,key,value);}catch(error){
    if(this!==localStorage)throw error;
    const cachedKeys:string[]=[];
    for(let index=0;index<localStorage.length;index++){const item=localStorage.key(index);if(item&&item!==key&&disposable.includes(logicalStorageKey(item)))cachedKeys.push(item);}
    cachedKeys.forEach(item=>localStorage.removeItem(item));
    try{setItem.call(this,key,value);}catch(retry){window.dispatchEvent(new Event('hasimio:storage-full'));throw retry;}
  }
};
