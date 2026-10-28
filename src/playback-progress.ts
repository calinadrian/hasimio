import type {Meta} from './media';
const storageKey='hasimio:playback-progress:v1';
const progressEvent='hasimio:playback-progress';
export type PlaybackProgress={position:number;duration:number;updatedAt:number;completed:boolean;titleKey?:string;videoId?:string;episodeLabel?:string};
export type ProgressMap=Record<string,PlaybackProgress>;
export const progressLimit=500;
export const newestFirst=(a:[string,PlaybackProgress],b:[string,PlaybackProgress])=>b[1].updatedAt-a[1].updatedAt||(a[0]<b[0]?-1:a[0]>b[0]?1:0);
export function progressSnapshot(){try{return localStorage.getItem(storageKey)??'{}';}catch{return '{}';}}
export function subscribeProgress(changed:()=>void){
  const storage=(event:StorageEvent)=>{if(event.key===storageKey||event.key===null)changed();};
  window.addEventListener(progressEvent,changed);window.addEventListener('storage',storage);
  return()=>{window.removeEventListener(progressEvent,changed);window.removeEventListener('storage',storage);};
}

export function playbackHistory(snapshot=progressSnapshot()):ProgressMap {
  try {
    const value=JSON.parse(snapshot);
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    return Object.fromEntries(Object.entries(value).filter(([,item])=>{
      const p=item as PlaybackProgress;
      return p&&Number.isFinite(p.position)&&p.position>=0&&Number.isFinite(p.duration)&&p.duration>0&&Number.isFinite(p.updatedAt)&&typeof p.completed==='boolean';
    })) as ProgressMap;
  }catch{return {};}
}
export const progressKey=(type:string,videoId:string)=>`${type}:${videoId}`;
export function savedProgress(key?:string):PlaybackProgress|undefined {return key?playbackHistory()[key]:undefined;}
export function resumePosition(key?:string) {
  const progress=savedProgress(key);
  return progress&&!progress.completed&&progress.position<progress.duration?progress.position:0;
}
export function saveProgress(key:string,position:number,duration:number,details:{completed?:boolean;titleKey?:string;videoId?:string;episodeLabel?:string}={}) {
  if(!key||!Number.isFinite(position)||position<0||!Number.isFinite(duration)||duration<=0)return;
  try{
    const all=playbackHistory();
    all[key]={position:Math.min(position,duration),duration,updatedAt:Date.now(),completed:details.completed??false,titleKey:details.titleKey,videoId:details.videoId,episodeLabel:details.episodeLabel};
    // Keep recent playback history bounded without touching the saved library.
    const recent=Object.entries(all).sort(newestFirst).slice(0,progressLimit);
    localStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(recent)));
    if(typeof window!=='undefined')window.dispatchEvent(new Event(progressEvent));
  }catch{/* Playback continues if browser storage is blocked or full. */}
}
export function lastPlayedEpisode(titleKey:string,videoIds:string[]) {
  const ids=new Set(videoIds);
  return Object.values(playbackHistory()).filter(p=>p.titleKey===titleKey&&p.videoId&&ids.has(p.videoId)).sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.videoId;
}
export type CardProgress=PlaybackProgress&{percent:number;episode?:string};
export function titleProgress(meta:Meta,history:ProgressMap):CardProgress|undefined {
  const key=progressKey(meta.type,meta.id);
  const latest=Object.entries(history).filter(([id,p])=>id===key||p.titleKey===key).sort((a,b)=>b[1].updatedAt-a[1].updatedAt)[0]?.[1];
  if(!latest||(!latest.completed&&latest.position===0))return;
  let episode:string|undefined;
  if(meta.type!=='movie'){
    const video=meta.videos?.find(v=>v.id===latest.videoId);
    const imdb=/^tt\d+:(\d+):(\d+)$/.exec(latest.videoId??'');
    const kitsu=/^kitsu:\d+:(\d+)$/.exec(latest.videoId??'');
    if(typeof latest.episodeLabel==='string'&&latest.episodeLabel)episode=latest.episodeLabel;
    else if(video?.episode!=null)episode=`${video.season!=null?`S${video.season} · `:''}E${video.episode}`;
    else if(imdb)episode=`S${Number(imdb[1])} · E${Number(imdb[2])}`;
    else if(kitsu)episode=`Episode ${Number(kitsu[1])}`;
  }
  return {...latest,episode,percent:latest.completed?100:Math.min(100,Math.max(0,Math.floor(latest.position/latest.duration*100)))};
}
