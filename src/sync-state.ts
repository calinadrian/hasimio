import {type Meta,type Addon,validateManifest} from './media';
import {playbackHistory,newestFirst,progressLimit,type PlaybackProgress} from './playback-progress';
import {validSetting,settingsKey} from './preferences';
import {builtinSourceUrls} from './catalogs';

export type SyncRecord={stamp:number;device:string;value:unknown|null};
export type SyncDocument={v:1;records:Record<string,SyncRecord>};
export const emptyDocument=():SyncDocument=>({v:1,records:{}});
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function title(value:unknown):value is Meta{return plain(value)&&typeof value.id==='string'&&value.id.length<=300&&typeof value.type==='string'&&value.type.length<=80&&typeof value.name==='string'&&value.name.length<=500;}
function source(value:unknown):value is Addon{
  if(!plain(value)||typeof value.url!=='string'||typeof value.enabled!=='boolean')return false;
  if(!builtinSourceUrls.includes(value.url)){try{const url=new URL(value.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return false;}catch{return false;}}
  try{validateManifest(value.manifest);return true;}catch{return false;}
}
// Values this version understands. Other records stay in the document untouched,
// so data synced by a newer app version survives on older devices.
function validValue(key:string,value:unknown){
  if(key.startsWith('library:'))return title(value)&&key==='library:'+value.type+':'+value.id;
  if(key.startsWith('addon:'))return source(value)&&key==='addon:'+value.manifest.id;
  if(key.startsWith('progress:'))return !!playbackHistory(JSON.stringify({entry:value})).entry;
  if(key.startsWith('setting:'))return validSetting(key.slice(8),value);
  return false;
}
export function validDocument(value:unknown):SyncDocument{
  if(!plain(value)||value.v!==1||!plain(value.records)||Object.keys(value.records).length>10000)throw Error('Invalid sync data.');
  const records:Record<string,SyncRecord>={};
  for(const [key,item] of Object.entries(value.records)){
    if(!plain(item)||!Number.isSafeInteger(item.stamp)||Number(item.stamp)<0||typeof item.device!=='string'||!/^[a-f\d]{32}$/.test(item.device)||key.length>800||item.value===undefined)throw Error('Invalid sync record.');
    records[key]={stamp:Number(item.stamp),device:item.device,value:item.value};
  }
  return {v:1,records};
}
export function mergeDocuments(a:SyncDocument,b:SyncDocument):SyncDocument{
  const records={...a.records};for(const [key,item] of Object.entries(b.records)){const old=records[key];if(!old||item.stamp>old.stamp||(item.stamp===old.stamp&&item.device>old.device))records[key]=item;}return {v:1,records};
}
// Removals older than this may reappear from a device that stayed offline longer.
const tombstoneAge=90*24*60*60*1000;
export function compactDocument(document:SyncDocument,clock=Date.now()):SyncDocument{
  const entries=Object.entries(document.records).filter(([key,record])=>record.value!==null||(!key.startsWith('progress:')&&record.stamp>clock-tombstoneAge));
  // Mirror the local unfinished-bookmark cap; completed entries keep watched totals intact.
  const evicted=new Set(entries.filter(([key,record])=>key.startsWith('progress:')&&!(record.value as PlaybackProgress).completed).map(([key,record]):[string,PlaybackProgress]=>[key.slice(9),{...record.value as PlaybackProgress,updatedAt:Number((record.value as PlaybackProgress).updatedAt)||0}]).sort(newestFirst).slice(progressLimit).map(([key])=>'progress:'+key));
  return {v:1,records:Object.fromEntries(entries.filter(([key])=>!evicted.has(key)))};
}
export function sameDocument(a:SyncDocument,b:SyncDocument){const keys=Object.keys(a.records);return keys.length===Object.keys(b.records).length&&keys.every(key=>{const left=a.records[key],right=b.records[key];return right&&left.stamp===right.stamp&&left.device===right.device&&JSON.stringify(left.value)===JSON.stringify(right.value);});}
function read(key:string,fallback:unknown){try{return JSON.parse(localStorage.getItem(key)??'null')??fallback;}catch{return fallback;}}
export function localValues():Record<string,unknown>{
  const values:Record<string,unknown>={};const library=read('hasimio:library',[]),addons=read('hasimio:addons',[]),settings=read(settingsKey,{});
  for(const meta of Array.isArray(library)?library:[])if(title(meta)){
    // Sync membership and identity; provider metadata refreshes independently.
    values['library:'+meta.type+':'+meta.id]=Object.fromEntries((['id','type','name','poster','background','releaseInfo','category','sourceUrl'] as const).filter(key=>meta[key]!==undefined).map(key=>[key,meta[key]]));
  }
  for(const addon of Array.isArray(addons)?addons:[])if(source(addon))values['addon:'+addon.manifest.id]=addon;
  for(const [key,value] of Object.entries(playbackHistory()))values['progress:'+key]=value;
  if(plain(settings))for(const [key,value] of Object.entries(settings))if(validSetting(key,value))values['setting:'+key]=value;
  return values;
}
export function captureChanges(document:SyncDocument,device:string,previous:Record<string,unknown>,current:Record<string,unknown>,clock=Date.now()):SyncDocument{
  let stamp=Math.max(clock,...Object.values(document.records).map(r=>r.stamp),0);const records={...document.records};
  for(const key of new Set([...Object.keys(previous),...Object.keys(current)]))if(!(key.startsWith('library:')&&previous[key]&&current[key])&&!(key.startsWith('progress:')&&current[key]===undefined)&&JSON.stringify(previous[key])!==JSON.stringify(current[key]))records[key]={stamp:++stamp,device,value:current[key]??null};
  return {v:1,records};
}
export function applyDocument(document:SyncDocument){
  const existing=read('hasimio:library',[]) as Meta[];const metadata=new Map((Array.isArray(existing)?existing:[]).filter(title).map(meta=>[meta.type+':'+meta.id,meta]));
  const saved=new Map<string,Meta>(),addons:Addon[]=[],progress:Record<string,unknown>={},settings:Record<string,unknown>={};
  for(const [key,record] of Object.entries(document.records)){
    if(record.value===null||!validValue(key,record.value))continue;
    if(key.startsWith('library:')){const value=record.value as Meta,id=value.type+':'+value.id;saved.set(id,{...metadata.get(id),...value});}
    else if(key.startsWith('addon:'))addons.push(record.value as Addon);
    else if(key.startsWith('progress:'))progress[key.slice(9)]=record.value;
    else if(key.startsWith('setting:'))settings[key.slice(8)]=record.value;
  }
  // Keep this device's library order and append titles saved elsewhere.
  const library=[...[...metadata.keys()].filter(id=>saved.has(id)),...[...saved.keys()].filter(id=>!metadata.has(id))].map(id=>saved.get(id)!);
  localStorage.setItem('hasimio:library',JSON.stringify(library));localStorage.setItem('hasimio:addons',JSON.stringify(addons));localStorage.setItem('hasimio:playback-progress:v1',JSON.stringify(progress));localStorage.setItem(settingsKey,JSON.stringify(settings));
  window.dispatchEvent(new Event('hasimio:remote-data'));window.dispatchEvent(new Event('hasimio:playback-progress'));
}
