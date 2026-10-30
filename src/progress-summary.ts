import {type Meta} from './media';
import {progressKey,type ProgressMap} from './playback-progress';
import {runtimeSeconds} from './watch-time';

export type MediaProgress={meta:Meta;watched:number;total:number;percent:number;lastUpdated:number;finished:boolean};
export type RecentWatch={meta:Meta;label:string;completed:boolean;percent:number;updatedAt:number;count?:number};
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
};

const watchPercent=(watched:number,total:number)=>total>0?Math.min(100,Math.round(watched/total*100)):0;
function episodeName(meta:Meta,videoId:string|undefined,label:string|undefined){
  if(label)return label;
  const video=meta.videos?.find(v=>v.id===videoId);
  if(video?.episode!=null)return `${video.season!=null?`S${video.season} · `:''}E${video.episode}`;
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
  type Group={meta?:Meta;watched:Set<string>;started:boolean;lastUpdated:number;movie:boolean};
  const groups=new Map<string,Group>();
  let watchTime=0,runtimeMissing=0;
  for(const [key,progress] of Object.entries(history)){
    const titleKey=progress.titleKey??key;
    const meta=known.get(titleKey);
    const movie=(meta?.type??key.split(':')[0])==='movie';
    let group=groups.get(titleKey);
    if(!group){group={meta,watched:new Set(),started:false,lastUpdated:0,movie};groups.set(titleKey,group);}
    else{group.meta??=meta;group.movie=group.movie||movie;}
    group.lastUpdated=Math.max(group.lastUpdated,progress.updatedAt);
    if(progress.completed){group.watched.add(progress.videoId??key);group.started=true;}
    else if(progress.position>0)group.started=true;
    if(progress.completed){
      // Prefer a measured file length, then the episode's runtime, then the title's
      // runtime (the usual episode length for a series). Never use the 1s manual sentinel.
      const video=meta?.videos?.find(video=>video.id===progress.videoId||progressKey(meta.type,video.id)===key);
      const seconds=(!progress.manual||progress.duration>1)?progress.duration:runtimeSeconds(video?.runtime)||runtimeSeconds(meta?.runtime);
      watchTime+=Math.max(0,seconds);
      if(!seconds)runtimeMissing++;
    }else if(!progress.manual)watchTime+=Math.max(0,progress.position);
  }
  let episodesWatched=0,moviesWatched=0,seriesStarted=0,seriesCompleted=0,episodesRemaining=0;
  const series:MediaProgress[]=[],movies:MediaProgress[]=[];
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
    if(group.meta)series.push({meta:group.meta,watched,total,percent:watchPercent(watched,total),lastUpdated:group.lastUpdated,finished});
  }
  series.sort((a,b)=>b.lastUpdated-a.lastUpdated);movies.sort((a,b)=>b.lastUpdated-a.lastUpdated);
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
  return {episodesWatched,moviesWatched,seriesStarted,seriesCompleted,episodesRemaining,watchTime,runtimeMissing,series,movies,recent:recent.slice(0,8)};
}
