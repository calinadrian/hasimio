import {serviceUrl} from './sync-crypto';
const overrideKey='hasimio:sync:service';
function browserName(agent:string){
  if(/electron\//i.test(agent))return 'App';
  if(/edg(e|a|ios)?\//i.test(agent))return 'Edge';
  if(/opr\//i.test(agent))return 'Opera';
  if(/samsungbrowser\//i.test(agent))return 'Samsung Internet';
  if(/firefox\/|fxios\//i.test(agent))return 'Firefox';
  if(/chrome\/|crios\//i.test(agent))return 'Chrome';
  if(/safari\//i.test(agent))return 'Safari';
  return '';
}
// Include the browser so two devices of the same kind are easier to tell apart.
export function suggestedDeviceName(agent=navigator.userAgent){
  if(/smart-tv|smarttv|tizen|webos|hbbtv|googletv|android.*tv|aft\w+/i.test(agent))return 'Living room TV';
  const kind=/ipad|tablet/i.test(agent)?'My tablet':/iphone/i.test(agent)?'My iPhone':/android/i.test(agent)?'My phone':/windows/i.test(agent)?'My PC':/macintosh|mac os/i.test(agent)?'My Mac':'My device',browser=browserName(agent);
  return browser?kind+' · '+browser:kind;
}
// Device names are chosen before a device sees the others, so number any that still match, oldest first.
export function deviceLabels(devices:{id:string;name:string;addedAt:number}[]){
  const labels=new Map<string,string>(),seen=new Map<string,number>();
  for(const device of [...devices].sort((a,b)=>a.addedAt-b.addedAt||(a.id<b.id?-1:1))){
    const count=(seen.get(device.name)??0)+1;seen.set(device.name,count);
    labels.set(device.id,count>1?device.name+' ('+count+')':device.name);
  }
  return labels;
}
export function savedService(){try{return localStorage.getItem(overrideKey)||'';}catch{return '';}}
export function rememberService(value:string){localStorage.setItem(overrideKey,serviceUrl(value));}
export const defaultSyncService='https://hasimio-sync.aqualoom256.chatgpt.site';
export async function discoverSyncService({configured=import.meta.env.VITE_SYNC_URL||defaultSyncService,origin=location.origin,override=savedService(),fetcher=fetch}:{configured?:string;origin?:string;override?:string;fetcher?:typeof fetch}={}){
  const candidates=[...new Set([override,configured,origin].filter(Boolean))];
  for(const candidate of candidates){
    let server;try{server=serviceUrl(candidate!);}catch{continue;}
    try{const response=await fetcher(server+'/api/sync/info',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))continue;const info=await response.json();if(info.version===1)return info.appUrl?serviceUrl(info.appUrl):server;}catch{/* Try the next publisher-provided or same-origin address. */}
  }
  return '';
}
