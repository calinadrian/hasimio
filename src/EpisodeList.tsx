import {useEffect,useState} from 'react';
import {Check,Clock} from 'lucide-react';
import {type Meta,type Video,episodeLabel,releaseCountdown,validRelease} from './media';
import {episodesBefore,progressKey,type ProgressMap} from './playback-progress';

const visibleEpisodes=10;
const seasonName=(season:number|undefined)=>season==null?'Episodes':season===0?'Specials':`Season ${season}`;
export default function EpisodeList({meta,episode,history,onSelect,onToggleWatched,onMarkPrevious,onMarkAll}:{meta:Meta;episode?:string;history:ProgressMap;onSelect:(id:string)=>void;onToggleWatched:(id:string,watched:boolean)=>void;onMarkPrevious:(id:string)=>void;onMarkAll:()=>void}){
  const episodes=meta.videos?.filter(v=>v.episode!=null)??[];
  // Specials sort after the numbered seasons, as most providers list them.
  const seasons=[...new Set(episodes.map(v=>v.season))].sort((a,b)=>(a===0?Infinity:a??-1)-(b===0?Infinity:b??-1));
  const selectedSeason=episodes.find(v=>v.id===episode)?.season;
  const [season,setSeason]=useState(selectedSeason??seasons[0]);
  const [showAll,setShowAll]=useState(false);
  const [prompt,setPrompt]=useState<{id:string;count:number}>();
  useEffect(()=>{if(episode)setSeason(selectedSeason);},[episode,selectedSeason]);
  useEffect(()=>{setShowAll(false);},[season]);
  useEffect(()=>{setPrompt(undefined);},[episode]);
  // Keeps upcoming countdowns current to the minute while the list is open.
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  if(!episodes.length)return null;
  const inSeason=episodes.filter(v=>v.season===season),count=(s:number|undefined)=>episodes.filter(v=>v.season===s).length;
  // Long seasons show the first episodes and expand in place, so the dialog keeps a single scroll area.
  const selectedIndex=inSeason.findIndex(v=>v.id===episode),expanded=showAll||selectedIndex>=visibleEpisodes;
  const shown=expanded?inSeason:inSeason.slice(0,visibleEpisodes);
  const selectedVideo=episodes.find(v=>v.id===episode);
  // Earlier episodes follow the same order as the list, across every season before this one.
  const previous=episode?episodesBefore(meta,episode):[];
  const unwatchedBefore=(id:string)=>episodesBefore(meta,id).filter(v=>!history[progressKey(meta.type,v.id)]?.completed).length;
  const unmarked=previous.filter(v=>!history[progressKey(meta.type,v.id)]?.completed).length;
  const promptVideo=prompt?episodes.find(v=>v.id===prompt.id):undefined,promptCount=promptVideo?unwatchedBefore(promptVideo.id):0;
  const allWatched=episodes.every(v=>history[progressKey(meta.type,v.id)]?.completed);
  function changeWatched(video:Video,watched:boolean) {
    onToggleWatched(video.id,watched);
    // Checking an episode offers to catch up everything before it, as TV Time does.
    setPrompt(watched?{id:video.id,count:unwatchedBefore(video.id)}:undefined);
  }
  function markPrevious(id:string) {onMarkPrevious(id);setPrompt(undefined);}
  return <section className="episode-list" aria-label="Episodes">
    <div className="episode-list-heading"><h3>Episodes</h3>{seasons.length>1&&seasons.length<=6&&<div className="season-tabs" role="group" aria-label="Season">{seasons.map(s=><button key={s??'none'} type="button" aria-pressed={s===season} title={`${count(s)} ${count(s)===1?'episode':'episodes'}`} onClick={()=>setSeason(s)}>{seasonName(s)}</button>)}</div>}{seasons.length>6&&<select aria-label="Season" value={season??''} onChange={e=>setSeason(e.target.value===''?undefined:Number(e.target.value))}>{seasons.map(s=><option key={s??'none'} value={s??''}>{seasonName(s)} ({count(s)} {count(s)===1?'episode':'episodes'})</option>)}</select>}</div>
    <div className="episode-bulk"><span>{allWatched?'All episodes watched':'Across all seasons'}</span><button type="button" disabled={allWatched} onClick={()=>{onMarkAll();setPrompt(undefined);}}>Mark all as watched</button></div>
    {promptVideo&&promptCount>0?<div className="episode-bulk episode-prompt" role="group" aria-label="Mark earlier episodes as watched"><span role="status"><strong>{promptCount}</strong> earlier {promptCount===1?'episode is':'episodes are'} not watched. Mark {promptCount===1?'it':'them'} as watched too?</span><div className="episode-prompt-actions"><button type="button" className="primary" onClick={()=>markPrevious(promptVideo.id)}>Mark {promptCount===1?'it':'them'}</button><button type="button" onClick={()=>setPrompt(undefined)}>Not now</button></div></div>:selectedVideo&&unmarked>0?<div className="episode-bulk"><span><strong>{unmarked}</strong> earlier {unmarked===1?'episode':'episodes'} not watched</span><button type="button" aria-label={`Mark ${unmarked} earlier ${unmarked===1?'episode':'episodes'} as watched`} title={`Mark every episode before ${episodeLabel(meta,selectedVideo)} as watched`} onClick={()=>markPrevious(selectedVideo.id)}>Mark previous as watched</button></div>:null}
    <ol>{shown.map(v=>{
      const progress=history[progressKey(meta.type,v.id)],countdown=v.released?releaseCountdown(v.released,now):undefined;
      const date=validRelease(v.released)?new Date(v.released!).toLocaleString(undefined,v.released!.includes('T')?{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}:{year:'numeric',month:'short',day:'numeric'}):'Date unannounced';
      const percent=progress?Math.min(100,Math.round(progress.position/progress.duration*100)):0;
      const watched=!!progress?.completed,label=episodeLabel(meta,v);
      return <li key={v.id} className={v.id===episode?'is-current':''}>
        <button type="button" className="episode-select" aria-current={v.id===episode} onClick={()=>onSelect(v.id)}>
          <span className="episode-number">{v.episode}</span>
          <span className="episode-text"><strong>{v.title||v.name||`Episode ${v.episode}`}</strong><small>{date}{countdown&&<em className="episode-countdown" title="Time until release"><Clock size={12}/>{countdown}</em>}</small></span>
          {!watched&&percent>0&&<span className="episode-progress" role="progressbar" aria-label="Playback progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width:`${percent}%`}}/></span>}
        </button>
        <button type="button" className="episode-toggle" aria-pressed={watched} aria-label={`Mark ${label} as ${watched?'unwatched':'watched'}`} title={watched?'Mark as unwatched':'Mark as watched'} onClick={()=>changeWatched(v,!watched)}><Check size={16}/></button>
      </li>;
    })}</ol>
    {!expanded&&inSeason.length>visibleEpisodes&&<button type="button" className="episode-more" onClick={()=>setShowAll(true)}>Show all {inSeason.length} episodes</button>}
  </section>;
}
