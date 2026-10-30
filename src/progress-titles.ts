import {type Meta} from './media';
import {type ProgressMap,progressKey} from './playback-progress';

const cacheKey='hasimio:progress-metadata:v1';
export function cachedProgressTitles():Meta[]{
  try{const items=JSON.parse(localStorage.getItem(cacheKey)??'[]');return Array.isArray(items)?items.filter(m=>m&&typeof m.id==='string'&&typeof m.type==='string'&&typeof m.name==='string'):[];}catch{return [];}
}
export function storeProgressTitles(items:Meta[]){
  try{localStorage.setItem(cacheKey,JSON.stringify(items));}catch{/* Metadata can be fetched again; history remains separate. */}
}
// Sync transfers history independently of library membership. Seed missing
// identities so they can be hydrated even before their catalog is browsed.
export function progressTitleSeeds(history:ProgressMap,known:Meta[]):Meta[]{
  const existing=new Set(known.map(m=>progressKey(m.type,m.id))),seeds=new Map<string,Meta>();
  for(const [key,p] of Object.entries(history)){
    if(!p.completed&&p.position<=0)continue;
    const titleKey=p.titleKey??key,separator=titleKey.indexOf(':');
    const type=titleKey.slice(0,separator),id=titleKey.slice(separator+1);
    if(existing.has(titleKey)||!['movie','series','anime'].includes(type)||!id||id.length>300)continue;
    seeds.set(titleKey,{id,type,name:'Title details unavailable',...(type==='anime'||id.startsWith('kitsu:')?{category:'anime' as const}:{}),metadataPartial:true});
  }
  return [...seeds.values()];
}
