import {forgetStreams} from './stream-cache';

// A debrid account, as in Stremio's Torrentio setup: Torrentio then returns
// direct links from the service, and files it already holds play at once with
// no peers. The key stays on this device: it is not part of the synced
// extension list or settings, and goes only to Hasimio's own playback service.
export const debridProviders=[
  {id:'realdebrid',name:'Real-Debrid',keyPage:'real-debrid.com/apitoken'},
  {id:'alldebrid',name:'AllDebrid',keyPage:'alldebrid.com/apikeys'},
  {id:'premiumize',name:'Premiumize',keyPage:'premiumize.me/account'},
  {id:'debridlink',name:'Debrid-Link',keyPage:'debrid-link.com/webapp/apikey'},
  {id:'torbox',name:'TorBox',keyPage:'torbox.app/settings'},
  {id:'offcloud',name:'Offcloud',keyPage:'offcloud.com/#/account'},
] as const;
export type Debrid={provider:string;key:string};
const storageKey='hasimio:debrid';

export function validDebridKey(key:string){return /^[A-Za-z0-9._:@-]{8,200}$/.test(key.trim());}
export function savedDebrid(storage?:Pick<Storage,'getItem'>):Debrid|undefined{
  try{
    const value=JSON.parse((storage??localStorage).getItem(storageKey)??'null') as Debrid|null;
    return value&&debridProviders.some(provider=>provider.id===value.provider)&&typeof value.key==='string'&&validDebridKey(value.key)?value:undefined;
  }catch{return undefined;}
}
export function saveDebrid(value:Debrid|undefined){
  try{if(value)localStorage.setItem(storageKey,JSON.stringify({provider:value.provider,key:value.key.trim()}));else localStorage.removeItem(storageKey);}catch{/* Storage blocked: sources stay as they are. */}
  // Sources found with the previous setting no longer apply.
  forgetStreams();
}
/**
 * The header Hasimio's playback service reads (server/stremio-sources.mjs
 * parseDebrid). Pass null for no account; omit it to use this device's one.
 */
export function debridHeaders(sourceUrl:string,account?:Debrid|null):Record<string,string>|undefined{
  const debrid=account===undefined?savedDebrid():account;
  return debrid&&/\/api\/extensions\/torrentio\//.test(sourceUrl)?{'X-Hasimio-Debrid':`${debrid.provider}=${debrid.key}`}:undefined;
}
export function debridName(debrid=savedDebrid()){return debridProviders.find(provider=>provider.id===debrid?.provider)?.name;}
