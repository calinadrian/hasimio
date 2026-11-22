import {profileStorage,storageKey as scopedStorageKey} from './profile-storage';
import {releasedEpisodes,seasonShortName,type Meta,type Video} from './media';
const storageKey='hasimio:playback-progress:v1';
const progressEvent='hasimio:playback-progress';
// Saving the history rewrites all of it, which is megabytes for a long history. While a video plays, its
// position goes to this small store instead and joins the history on the next whole save: pausing, seeking,
// finishing, leaving the player, or any other change to the history. Readers always see the two combined.
const liveKey='hasimio:playback-progress:live';
// Joins the two stores in one snapshot. JSON text cannot contain this character unescaped.
const liveMark='\0';
// Manually watched entries have no real runtime yet, so cards hide their play time.
const manualDuration=1;
export type PlaybackProgress={position:number;duration:number;updatedAt:number;completed:boolean;titleKey?:string;videoId?:string;episodeLabel?:string;manual?:boolean};
export type ProgressMap=Record<string,PlaybackProgress>;
export type WatchTarget={key:string;titleKey?:string;videoId?:string;episodeLabel?:string};
export const progressLimit=500;
export const newestFirst=(a:[string,PlaybackProgress],b:[string,PlaybackProgress])=>b[1].updatedAt-a[1].updatedAt||(a[0]<b[0]?-1:a[0]>b[0]?1:0);
export function progressSnapshot(){try{const history=profileStorage.getItem(storageKey)??'{}',live=profileStorage.getItem(liveKey);return live?history+liveMark+live:history;}catch{return '{}';}}
export function subscribeProgress(changed:()=>void){
  const storage=(event:StorageEvent)=>{if(event.key===scopedStorageKey(storageKey)||event.key===scopedStorageKey(liveKey)||event.key===null)changed();};
  window.addEventListener(progressEvent,changed);window.addEventListener('storage',storage);
  return()=>{window.removeEventListener(progressEvent,changed);window.removeEventListener('storage',storage);};
}

// A deletion timestamp shares the same storage write as Undo. It survives an offline
// restart, while bookmarks dropped by the capacity limit simply disappear.
export const removalLifetime=90*24*60*60*1000;
type StoredProgress=Record<string,PlaybackProgress|number>;
export function readProgress(snapshot:string,includeRemovals:true):StoredProgress;
export function readProgress(snapshot:string,includeRemovals:false):ProgressMap;
export function readProgress(snapshot:string,includeRemovals:boolean):StoredProgress {
  try {
    const cut=snapshot.indexOf(liveMark),value=JSON.parse(cut<0?snapshot:snapshot.slice(0,cut));
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    const history=Object.fromEntries(Object.entries(value).filter(([,item])=>
      validProgress(item)||(includeRemovals&&typeof item==='number'&&item>Date.now()-removalLifetime)
    )) as StoredProgress;
    const live=cut<0?undefined:livePosition(snapshot.slice(cut+1));
    // The history wins only when it is newer, as after another device's position arrived.
    if(live){
      const stored=value[live.key];
      const savedAt=typeof stored==='number'?stored:validProgress(stored)?stored.updatedAt:undefined;
      if(savedAt===undefined||live.entry.updatedAt>=savedAt)history[live.key]=live.entry;
    }
    return history;
  }catch{return {};}
}
export function playbackHistory(snapshot=progressSnapshot()):ProgressMap {return readProgress(snapshot,false);}
function validProgress(item:unknown):item is PlaybackProgress {
  const p=item as PlaybackProgress;
  return !!p&&Number.isFinite(p.position)&&p.position>=0&&Number.isFinite(p.duration)&&p.duration>0&&Number.isFinite(p.updatedAt)&&typeof p.completed==='boolean';
}
function livePosition(text:string|null):{key:string;entry:PlaybackProgress}|undefined {
  try{const value=JSON.parse(text??'null');return value&&typeof value.key==='string'&&value.key&&validProgress(value.entry)?value:undefined;}catch{return undefined;}
}
// Called after the whole history is written with the playing position already included, or replaced by sync.
export function dropLivePosition() {try{if(profileStorage.getItem(liveKey)!==null)profileStorage.removeItem(liveKey);}catch{/* A leftover position is ignored once the history holds a newer one. */}}
export const progressKey=(type:string,videoId:string)=>`${type}:${videoId}`;
export function savedProgress(key?:string):PlaybackProgress|undefined {return key?playbackHistory()[key]:undefined;}
export function resumePosition(key?:string) {
  const progress=savedProgress(key);
  return progress&&!progress.completed&&progress.position<progress.duration?progress.position:0;
}
export function saveProgress(key:string,position:number,duration:number,details:{completed?:boolean;titleKey?:string;videoId?:string;episodeLabel?:string;live?:boolean}={}) {
  if(!key||!Number.isFinite(position)||position<0||!Number.isFinite(duration)||duration<=0)return;
  try{
    const entry:PlaybackProgress={position:Math.min(position,duration),duration,updatedAt:Date.now(),completed:details.completed??false,titleKey:details.titleKey,videoId:details.videoId,episodeLabel:details.episodeLabel};
    if(details.live){
      // A position left by another video, as after a crash, joins the history below instead of being overwritten.
      const current=profileStorage.getItem(liveKey);
      if(current===null||livePosition(current)?.key===key){profileStorage.setItem(liveKey,JSON.stringify({key,entry}));if(typeof window!=='undefined')window.dispatchEvent(new Event(progressEvent));return;}
    }
    const all=readProgress(progressSnapshot(),true);
    all[key]=entry;
    persistHistory(all);
  }catch{/* Playback continues if browser storage is blocked or full. */}
}
function persistHistory(all:StoredProgress) {
  // Keep completed history for watched totals, while bounding unfinished bookmarks.
  let unfinished=0;
  const deleted:Record<string,number>={};
  const bookmarks:[string,PlaybackProgress][]=[];
  for(const [key,entry] of Object.entries(all)){
    if(typeof entry==='number')deleted[key]=entry;
    else bookmarks.push([key,entry]);
  }
  const recent=bookmarks.sort(newestFirst).filter(([,p])=>p.completed||unfinished++<progressLimit);
  profileStorage.setItem(storageKey,JSON.stringify({...deleted,...Object.fromEntries(recent)}));
  dropLivePosition();
  if(typeof window!=='undefined')window.dispatchEvent(new Event(progressEvent));
}
// Without a credits marker, the last 10% (at most 8 minutes) is treated as end credits.
export const endCreditsFrom=(duration:number)=>duration-Math.min(duration*0.1,480);
// Bookmarks left in the end credits before that counted as watched. Runs at startup and only writes
// when something changed, so the upgrade also reaches synced devices. Short clips are left alone.
export function upgradeCreditsBookmarks() {
  try{
    const all=readProgress(progressSnapshot(),true);let changed=false;
    for(const [key,p] of Object.entries(all)){
      if(typeof p==='number'||p.completed||p.manual||p.position<=0||p.duration<120||p.position<endCreditsFrom(p.duration))continue;
      all[key]={...p,completed:true};changed=true;
    }
    if(changed)persistHistory(all);
    return changed;
  }catch{return false;}
}

// Marking watched does not invent a runtime; keep a known one so resuming still starts at the beginning.
export function setWatched(targets:WatchTarget[],watched=true) {
  if(!targets.length)return;
  try{
    const all=readProgress(progressSnapshot(),true),updatedAt=Date.now();
    for(const target of targets){
      if(!target.key)continue;
      const stored=all[target.key];
      const existing=typeof stored==='number'?undefined:stored;
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
    const all=readProgress(progressSnapshot(),true);
    for(const [key,progress] of Object.entries(entries)){
      if(progress)all[key]=progress;
      else if(all[key]!==undefined)all[key]=Date.now();
    }
    persistHistory(all);
  }catch{/* The toast still closes when storage is unavailable. */}
}
// Episode IDs already identify their title, and an anime season watched before its series was merged has an older title key.
export function lastPlayedEpisode(videoIds:string[]) {
  const ids=new Set(videoIds);
  return Object.values(playbackHistory()).filter(p=>p.videoId&&ids.has(p.videoId)&&!p.manual).sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.videoId;
}
// Progress saved against one anime season counts toward the merged series. Stored history stays untouched.
export function canonicalHistory(history:ProgressMap,metas:Meta[]):ProgressMap {
  const aliases=new Map<string,string>();
  for(const meta of metas)for(const id of meta.seasonIds??[])if(id!==meta.id)aliases.set(progressKey(meta.type,id),progressKey(meta.type,meta.id));
  if(!aliases.size)return history;
  let changed=false;
  const result=Object.fromEntries(Object.entries(history).map(([key,progress])=>{
    const titleKey=progress.titleKey&&aliases.get(progress.titleKey);
    if(!titleKey)return [key,progress];
    changed=true;
    return [key,{...progress,titleKey}];
  }));
  return changed?result:history;
}
const seasonRank=(season:number|undefined)=>season==null?-1:season===0?Number.MAX_SAFE_INTEGER:season;
export const episodeOrder=(a:Video,b:Video)=>seasonRank(a.season)-seasonRank(b.season)||(a.episode??0)-(b.episode??0);
// Reopening a series resumes real playback first, then falls in after the last episode checked by hand.
export function nextEpisodeToWatch(meta:Meta,history:ProgressMap):string|undefined {
  const ordered=(meta.videos??[]).filter(v=>v.episode!=null).sort(episodeOrder);
  const played=lastPlayedEpisode(ordered.map(v=>v.id));
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
export type CardProgress=PlaybackProgress&{percent:number;episode?:string;status?:string};
export function titleProgress(meta:Meta,history:ProgressMap):CardProgress|undefined {
  const key=progressKey(meta.type,meta.id);
  const entries=Object.entries(history).filter(([id,p])=>id===key||p.titleKey===key).sort((a,b)=>b[1].updatedAt-a[1].updatedAt);
  // A manually checked earlier episode should not hide what is actually in progress.
  let latest=entries.find(([,p])=>p.completed||p.position>0)?.[1];
  if(latest?.completed&&latest.manual)latest=entries.find(([,p])=>!p.completed&&p.position>0)?.[1]??latest;
  if(!latest||(!latest.completed&&latest.position===0))return;
  let episode:string|undefined;
  if(meta.type!=='movie'){
    const video=meta.videos?.find(v=>v.id===latest.videoId);
    const imdb=/^tt\d+:(\d+):(\d+)$/.exec(latest.videoId??'');
    const kitsu=/^kitsu:\d+:(\d+)$/.exec(latest.videoId??'');
    if(typeof latest.episodeLabel==='string'&&latest.episodeLabel)episode=latest.episodeLabel;
    else if(video?.episode!=null)episode=`${video.season!=null?`${seasonShortName(video)} · `:''}E${video.episode}`;
    else if(imdb)episode=`S${Number(imdb[1])} · E${Number(imdb[2])}`;
    else if(kitsu)episode=`Episode ${Number(kitsu[1])}`;
  }
  let status=latest.completed?'Watched':episode?`Resume ${episode}`:'Continue';
  if(meta.type!=='movie'){
    const all=(meta.videos??[]).filter(v=>v.episode!=null).sort(episodeOrder);
    const regular=all.filter(v=>v.season!==0);
    const episodes=regular.length?regular:all;
    const available=releasedEpisodes(episodes);
    const watched=(video:Video)=>!!history[progressKey(meta.type,video.id)]?.completed;
    const completed=available.filter(watched);
    const current=all.find(v=>v.id===latest.videoId);
    const last=completed[completed.length-1];
    const target=latest.completed?last:current;
    const season=target?all.filter(v=>v.season===target.season):[];
    const number=target?.episode;
    const label=target?`${target.season===0?'Specials':target.season!=null?seasonShortName(target):'Episodes'} · E${number}${!meta.metadataPartial&&season.length?`/${season.length}`:''}`:episode;
    if(latest.completed){
      if(!meta.metadataPartial&&available.length&&available.every(watched))status=available.length<episodes.length?'Caught up':'Watched';
      else if(last){
        const contiguous=available.slice(0,available.indexOf(last)+1).every(watched);
        status=contiguous?`Watched through ${label}`:`${completed.length}/${available.length} episodes watched`;
      }else status=episode?`Watched ${episode}`:'Episode watched';
    }else if(label)status=`Resume ${label}`;
  }
  return {...latest,episode,status,percent:latest.completed?100:Math.min(100,Math.max(0,Math.floor(latest.position/latest.duration*100)))};
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
        const remaining=releasedEpisodes([...(regular.length?regular:episodes)].sort(episodeOrder)).some(video=>
          !history[progressKey(meta.type,video.id)]?.completed);
        if(!entries.some(([,entry])=>entry.completed)||!remaining)continue;
      }
    }
    result.push(meta);if(result.length>=limit)break;
  }
  return result;
}
