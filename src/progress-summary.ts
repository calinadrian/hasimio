import {releaseTime,releasedEpisodes,seasonShortName,type Meta,type Video} from './media';
import {episodeOrder,progressKey,type ProgressMap} from './playback-progress';
import {runtimeSeconds} from './watch-time';

export type MediaProgress={meta:Meta;watched:number;total:number;percent:number;lastUpdated:number;finished:boolean};
export type RecentWatch={meta:Meta;label:string;completed:boolean;percent:number;updatedAt:number;count?:number};
/** What to watch next in a started series: an episode to resume, the next one, or one still to air. */
export type UpNext={meta:Meta;video:Video;label:string;resume?:number;airs?:number;fresh?:boolean;watched:number;total:number;percent:number;lastUpdated:number};
/** Movies and episodes finished on one local day, and their running time. */
export type ActivityDay={count:number;seconds:number};
export type ProgressSummary={
  episodesWatched:number;
  moviesWatched:number;
  seriesStarted:number;
  seriesCompleted:number;
  episodesRemaining:number;
  watchTime:number;
  runtimeMissing:number;
  series:MediaProgress[];
  movies:MediaProgress[];
  recent:RecentWatch[];
  upNext:UpNext[];
  /** Keyed by local date (dayKey). */
  activity:Map<string,ActivityDay>;
  /** Time watched per genre of known titles, most first. A title counts toward each of its genres. */
  genres:{genre:string;seconds:number}[];
};

// Imports fall back to a placeholder time when a watch date is unknown; such marks have no day.
const EARLIEST_ACTIVITY=Date.UTC(2000,0,1);
const UP_NEXT_RECENT_MS=90*86_400_000,UP_NEXT_NEW_MS=60*86_400_000,UP_NEXT_SOON_MS=30*86_400_000;
const pad=(value:number)=>String(value).padStart(2,'0');
/** A local calendar date, e.g. 2026-11-22. */
export function dayKey(time:number){const date=new Date(time);return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;}
const startOfDay=(time:number)=>{const date=new Date(time);date.setHours(0,0,0,0);return date.getTime();};
const addDays=(time:number,days:number)=>{const date=new Date(time);date.setDate(date.getDate()+days);return date.getTime();};

const watchPercent=(watched:number,total:number)=>total>0?Math.min(100,Math.round(watched/total*100)):0;
function episodeName(meta:Meta,videoId:string|undefined,label:string|undefined){
  if(label)return label;
  const video=meta.videos?.find(v=>v.id===videoId);
  if(video?.episode!=null)return `${video.season!=null?`${seasonShortName(video)} · `:''}E${video.episode}`;
  return meta.type==='movie'?'Movie':'Episode';
}
// Counts manual marks and real playback together. Titles the app does not know stay out of the lists
// but still contribute to the totals, mirroring Continue watching.
export function progressSummary(history:ProgressMap,titles:Meta[]):ProgressSummary{
  const known=new Map<string,Meta>();
  for(const meta of titles){
    const key=progressKey(meta.type,meta.id),existing=known.get(key);
    if(!existing||(meta.videos?.length??0)>(existing.videos?.length??0))known.set(key,meta);
  }
  type Group={meta?:Meta;watched:Set<string>;started:boolean;lastUpdated:number;movie:boolean;playing?:{videoId:string;percent:number;updatedAt:number}};
  const groups=new Map<string,Group>();
  let watchTime=0,runtimeMissing=0;
  // Marking a whole season or series watched stamps every episode with the same time. That is
  // catching up, not watching, so such batches stay out of the daily activity.
  const batchSizes=new Map<string,number>();
  for(const [key,progress] of Object.entries(history))if(progress.manual&&progress.completed){const batch=(progress.titleKey??key)+':'+progress.updatedAt;batchSizes.set(batch,(batchSizes.get(batch)??0)+1);}
  const activity=new Map<string,ActivityDay>(),genreTime=new Map<string,number>();
  for(const [key,progress] of Object.entries(history)){
    const titleKey=progress.titleKey??key;
    const meta=known.get(titleKey);
    const movie=(meta?.type??key.split(':')[0])==='movie';
    let group=groups.get(titleKey);
    if(!group){group={meta,watched:new Set(),started:false,lastUpdated:0,movie};groups.set(titleKey,group);}
    else{group.meta??=meta;group.movie=group.movie||movie;}
    group.lastUpdated=Math.max(group.lastUpdated,progress.updatedAt);
    if(progress.completed){group.watched.add(progress.videoId??key);group.started=true;}
    else if(progress.position>0){
      group.started=true;
      if(!progress.manual&&progress.videoId&&(!group.playing||progress.updatedAt>group.playing.updatedAt))group.playing={videoId:progress.videoId,percent:Math.min(99,Math.round(progress.position/progress.duration*100)),updatedAt:progress.updatedAt};
    }
    if(progress.completed){
      // Prefer a measured file length, then the episode's runtime, then the title's
      // runtime (the usual episode length for a series). Never use the 1s manual sentinel.
      const video=meta?.videos?.find(video=>video.id===progress.videoId||progressKey(meta.type,video.id)===key);
      const seconds=Math.max(0,(!progress.manual||progress.duration>1)?progress.duration:runtimeSeconds(video?.runtime)||runtimeSeconds(meta?.runtime));
      watchTime+=seconds;
      if(!seconds)runtimeMissing++;
      for(const genre of new Set(meta?.genres??[]))genreTime.set(genre,(genreTime.get(genre)??0)+seconds);
      const batch=progress.manual?batchSizes.get(titleKey+':'+progress.updatedAt)??1:1;
      if(progress.updatedAt>=EARLIEST_ACTIVITY&&batch===1){
        const day=dayKey(progress.updatedAt),entry=activity.get(day)??{count:0,seconds:0};
        entry.count++;entry.seconds+=seconds;activity.set(day,entry);
      }
    }else if(!progress.manual)watchTime+=Math.max(0,progress.position);
  }
  let episodesWatched=0,moviesWatched=0,seriesStarted=0,seriesCompleted=0,episodesRemaining=0;
  const series:MediaProgress[]=[],movies:MediaProgress[]=[],upNext:UpNext[]=[];
  const now=Date.now();
  for(const group of groups.values()){
    if(group.movie){
      if(!group.watched.size)continue;
      moviesWatched++;
      if(group.meta)movies.push({meta:group.meta,watched:1,total:1,percent:100,lastUpdated:group.lastUpdated,finished:true});
      continue;
    }
    const episodes=group.meta?.videos?.filter(v=>v.episode!=null)??[];
    const matched=episodes.filter(v=>group.watched.has(v.id)).length;
    episodesWatched+=group.watched.size;
    if(!group.started)continue;
    seriesStarted++;
    const total=episodes.length,watched=total>0?matched:group.watched.size;
    if(total>0)episodesRemaining+=Math.max(0,total-watched);
    const finished=total>0&&matched>=total;
    if(finished)seriesCompleted++;
    if(!group.meta)continue;
    const item={meta:group.meta,watched,total,percent:watchPercent(watched,total),lastUpdated:group.lastUpdated,finished};
    series.push(item);
    if(finished||!total)continue;
    // An episode left part way through comes first; otherwise the one after the furthest watched.
    const ordered=[...episodes].sort(episodeOrder);
    const out=new Set(releasedEpisodes(ordered,now,group.meta.metadataPartial));
    // Only while it is the latest thing watched in the series.
    let next=group.playing&&group.playing.updatedAt>=group.lastUpdated?ordered.find(video=>video.id===group.playing!.videoId&&!group.watched.has(video.id)):undefined;
    if(!next){
      let furthest=-1;ordered.forEach((video,index)=>{if(group.watched.has(video.id))furthest=index;});
      // History that matches none of the listed episodes (other ids) gives no place to continue from.
      if(furthest<0)continue;
      next=ordered[furthest+1];
    }
    if(!next)continue;
    const resuming=next.id===group.playing?.videoId,released=releaseTime(next.released);
    // An announced episode without a date has nothing to watch or count down to yet.
    if(!resuming&&released===undefined&&!out.has(next))continue;
    const airs=released!==undefined&&released>now?released:undefined;
    // Up next covers series watched lately, plus any whose next episode came out since you last
    // watched or airs soon. Long-paused series stay in the full list without crowding it.
    const fresh=released!==undefined&&released<=now&&released>group.lastUpdated&&released>now-UP_NEXT_NEW_MS;
    if(group.lastUpdated<now-UP_NEXT_RECENT_MS&&!fresh&&!(airs&&airs<now+UP_NEXT_SOON_MS))continue;
    upNext.push({...item,video:next,label:`${next.season!=null?`${seasonShortName(next)} · `:''}E${next.episode}`,resume:resuming?group.playing!.percent:undefined,airs,fresh:fresh||undefined});
  }
  series.sort((a,b)=>b.lastUpdated-a.lastUpdated);movies.sort((a,b)=>b.lastUpdated-a.lastUpdated);
  // Still to air goes last, soonest first.
  upNext.sort((a,b)=>Number(!!a.airs)-Number(!!b.airs)||(a.airs&&b.airs?a.airs-b.airs:b.lastUpdated-a.lastUpdated));
  const recent:RecentWatch[]=[];
  const batches=new Map<string,RecentWatch>();
  for(const [key,progress] of Object.entries(history).sort((a,b)=>b[1].updatedAt-a[1].updatedAt)){
    if(!progress.completed&&progress.position===0)continue;
    const meta=known.get(progress.titleKey??key);
    if(!meta)continue;
    const batchKey=progress.titleKey+':'+progress.updatedAt;
    const batch=progress.manual&&progress.completed&&meta.type!=='movie'?batches.get(batchKey):undefined;
    if(batch){batch.count=(batch.count??1)+1;batch.label=batch.count+' episodes marked watched';continue;}
    const item={meta,label:episodeName(meta,progress.videoId,progress.episodeLabel),completed:progress.completed,percent:progress.completed?100:Math.min(100,Math.round(progress.position/progress.duration*100)),updatedAt:progress.updatedAt};
    recent.push(item);
    if(progress.manual&&progress.completed&&meta.type!=='movie')batches.set(batchKey,item);
  }
  const genres=[...genreTime].filter(([,seconds])=>seconds>0).sort((a,b)=>b[1]-a[1]).map(([genre,seconds])=>({genre,seconds}));
  return {episodesWatched,moviesWatched,seriesStarted,seriesCompleted,episodesRemaining,watchTime,runtimeMissing,series,movies,recent:recent.slice(0,8),upNext,activity,genres};
}

export type ActivityCell={date:string;time:number;count:number;seconds:number;level:0|1|2|3|4};
/**
 * The last `weeks` weeks as columns of Monday-to-Sunday cells, ending with this week. Days still
 * ahead are null. Busy days are shaded by quartile of the active days shown, so one long binge
 * does not leave every other day looking empty.
 */
export function activityCalendar(activity:Map<string,ActivityDay>,today=Date.now(),weeks=53){
  const end=startOfDay(today),monday=addDays(end,-((new Date(end).getDay()+6)%7)),first=addDays(monday,-7*(weeks-1));
  const columns:(ActivityCell|null)[][]=[];
  for(let week=0;week<weeks;week++)columns.push(Array.from({length:7},(_,day)=>{
    const time=addDays(first,week*7+day);
    if(time>end)return null;
    const date=dayKey(time),entry=activity.get(date);
    return {date,time,count:entry?.count??0,seconds:entry?.seconds??0,level:0};
  }));
  const counts=columns.flat().filter((cell):cell is ActivityCell=>!!cell&&cell.count>0).map(cell=>cell.count).sort((a,b)=>a-b);
  const quartile=(q:number)=>counts[Math.floor(q*(counts.length-1))];
  const limits=[quartile(.25),quartile(.5),quartile(.75)];
  // When every active day is alike there is nothing to compare, so they share one clear shade.
  const alike=counts[0]===counts[counts.length-1];
  for(const cell of columns.flat())if(cell?.count)cell.level=alike?3:cell.count<=limits[0]?1:cell.count<=limits[1]?2:cell.count<=limits[2]?3:4;
  // A month is labelled above the first week that starts in it.
  const months:{column:number;label:string}[]=[];
  columns.forEach((column,index)=>{
    const start=column[0]?.time??addDays(first,index*7),previous=index?addDays(first,(index-1)*7):undefined;
    if(previous===undefined||new Date(previous).getMonth()!==new Date(start).getMonth())months.push({column:index,label:new Date(start).toLocaleDateString(undefined,{month:'short'})});
  });
  // The first label is dropped when the next month starts too soon for both to fit.
  if(months.length>1&&months[1].column-months[0].column<3)months.shift();
  return {columns,months,activeDays:counts.length,total:counts.reduce((sum,count)=>sum+count,0)};
}

/** Last seven days, and runs of consecutive days with something finished. Today does not break a run until it ends. */
export function activityFacts(activity:Map<string,ActivityDay>,today=Date.now()){
  const end=startOfDay(today);
  let weekCount=0,weekSeconds=0;
  for(let day=0;day<7;day++){const entry=activity.get(dayKey(addDays(end,-day)));if(entry){weekCount+=entry.count;weekSeconds+=entry.seconds;}}
  let current=0;
  for(let day=activity.has(dayKey(end))?0:1;activity.has(dayKey(addDays(end,-day)));day++)current++;
  const days=[...activity.keys()].sort();
  let longest=0,run=0,previous:string|undefined;
  for(const date of days){
    const [year,month,day]=date.split('-').map(Number),time=new Date(year,month-1,day).getTime();
    run=previous!==undefined&&previous===dayKey(addDays(time,-1))?run+1:1;
    longest=Math.max(longest,run);previous=date;
  }
  return {weekCount,weekSeconds,currentStreak:current,longestStreak:longest};
}
