import {validRelease,type Meta,type Video} from './media';
const storageKey='hasimio:playback-progress:v1';
const progressEvent='hasimio:playback-progress';
// Manually watched entries have no real runtime yet, so cards hide their play time.
const manualDuration=1;
export type PlaybackProgress={position:number;duration:number;updatedAt:number;completed:boolean;titleKey?:string;videoId?:string;episodeLabel?:string;manual?:boolean};
export type ProgressMap=Record<string,PlaybackProgress>;
export type WatchTarget={key:string;titleKey?:string;videoId?:string;episodeLabel?:string};
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
    persistHistory(all);
  }catch{/* Playback continues if browser storage is blocked or full. */}
}
function persistHistory(all:ProgressMap) {
  // Keep completed history for watched totals, while bounding unfinished bookmarks.
  let unfinished=0;
  const recent=Object.entries(all).sort(newestFirst).filter(([,p])=>p.completed||unfinished++<progressLimit);
  localStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(recent)));
  if(typeof window!=='undefined')window.dispatchEvent(new Event(progressEvent));
}
// Marking watched does not invent a runtime; keep a known one so resuming still starts at the beginning.
export function setWatched(targets:WatchTarget[],watched=true) {
  if(!targets.length)return;
  try{
    const all=playbackHistory(),updatedAt=Date.now();
    for(const target of targets){
      if(!target.key)continue;
      const existing=all[target.key];
      if(!watched){
        if(!existing)continue;
        const next={...existing,position:0,updatedAt,completed:false};
        delete next.manual;
        all[target.key]=next;
        continue;
      }
      const duration=existing?.duration||manualDuration;
      all[target.key]={position:duration,duration,updatedAt,completed:true,manual:existing?.completed?existing.manual:true,titleKey:target.titleKey??existing?.titleKey,videoId:target.videoId??existing?.videoId,episodeLabel:target.episodeLabel??existing?.episodeLabel};
    }
    persistHistory(all);
  }catch{/* The library keeps working when storage is blocked or full. */}
}
// Undo restores the exact earlier bookmarks instead of guessing what was watched before.
export function restoreProgress(entries:Record<string,PlaybackProgress|undefined>) {
  try{
    const all=playbackHistory();
    for(const [key,progress] of Object.entries(entries)){
      if(progress)all[key]=progress;else delete all[key];
    }
    persistHistory(all);
  }catch{/* The toast still closes when storage is unavailable. */}
}
export function lastPlayedEpisode(titleKey:string,videoIds:string[]) {
  const ids=new Set(videoIds);
  return Object.values(playbackHistory()).filter(p=>p.titleKey===titleKey&&p.videoId&&ids.has(p.videoId)&&!p.manual).sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.videoId;
}
const seasonRank=(season:number|undefined)=>season==null?-1:season===0?Number.MAX_SAFE_INTEGER:season;
export const episodeOrder=(a:Video,b:Video)=>seasonRank(a.season)-seasonRank(b.season)||(a.episode??0)-(b.episode??0);
// Reopening a series resumes real playback first, then falls in after the last episode checked by hand.
export function nextEpisodeToWatch(meta:Meta,history:ProgressMap):string|undefined {
  const ordered=(meta.videos??[]).filter(v=>v.episode!=null).sort(episodeOrder);
  const played=lastPlayedEpisode(progressKey(meta.type,meta.id),ordered.map(v=>v.id));
  if(played)return played;
  let lastWatched=-1;
  ordered.forEach((video,index)=>{if(history[progressKey(meta.type,video.id)]?.completed)lastWatched=index;});
  if(lastWatched<0)return;
  return ordered[lastWatched+1]?.id??ordered[lastWatched].id;
}
// Episodes shown above this one, including earlier seasons. Specials stay in their own group
// so checking a special never marks the whole numbered run watched.
export function episodesBefore(meta:Meta,videoId:string):Video[] {
  const episodes=(meta.videos??[]).filter(v=>v.episode!=null);
  const selected=episodes.find(v=>v.id===videoId);
  if(!selected)return [];
  const special=selected.season===0;
  const ordered=episodes.filter(v=>(v.season===0)===special).sort(episodeOrder);
  const index=ordered.findIndex(v=>v.id===videoId);
  return index<0?[]:ordered.slice(0,index);
}
export type CardProgress=PlaybackProgress&{percent:number;episode?:string};
export function titleProgress(meta:Meta,history:ProgressMap):CardProgress|undefined {
  const key=progressKey(meta.type,meta.id);
  const entries=Object.entries(history).filter(([id,p])=>id===key||p.titleKey===key).sort((a,b)=>b[1].updatedAt-a[1].updatedAt);
  // A manually checked earlier episode should not hide what is actually in progress.
  let latest=entries[0]?.[1];
  if(latest?.completed&&latest.manual)latest=entries.find(([,p])=>!p.completed&&p.position>0)?.[1]??latest;
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
// Titles with unfinished playback, newest first. Only titles the app already knows can be shown.
export function continueWatching(history:ProgressMap,metas:Meta[],limit=20):Meta[] {
  const known=new Map<string,Meta>();
  for(const meta of metas){
    const key=progressKey(meta.type,meta.id),existing=known.get(key);
    if(!existing||(meta.videos?.length??0)>(existing.videos?.length??0))known.set(key,meta);
  }
  const groups=new Map<string,[string,PlaybackProgress][]>();
  for(const [key,p] of Object.entries(history)){
    const titleKey=p.titleKey??key,entries=groups.get(titleKey)??[];
    entries.push([key,p]);groups.set(titleKey,entries);
  }
  const seen=new Set<string>(),result:Meta[]=[];
  for(const [key,p] of Object.entries(history).sort(newestFirst)){
    const titleKey=p.titleKey??key;if(seen.has(titleKey))continue;seen.add(titleKey);
    const meta=known.get(titleKey);if(!meta)continue;
    if(meta.type==='movie'){
      if(p.completed||p.position===0)continue;
    }else{
      const entries=groups.get(titleKey)!;
      const unfinished=entries.some(([,entry])=>!entry.completed&&entry.position>0);
      if(!unfinished){
        // A completed bookmark alone is not something to resume. Include a series
        // only when its metadata identifies another available, unwatched episode.
        const episodes=meta.videos?.filter(video=>video.episode!=null)??[];
        const regular=episodes.filter(video=>video.season!==0);
        const remaining=(regular.length?regular:episodes).some(video=>
          (!validRelease(video.released)||Date.parse(video.released!)<=Date.now())&&
          !history[progressKey(meta.type,video.id)]?.completed);
        if(!entries.some(([,entry])=>entry.completed)||!remaining)continue;
      }
    }
    result.push(meta);if(result.length>=limit)break;
  }
  return result;
}
