import {useEffect,useState} from 'react';
import {Check,Clock} from 'lucide-react';
import {type Meta,releaseCountdown,validRelease} from './media';
import {progressKey,type ProgressMap} from './playback-progress';

const visibleEpisodes=10;
const seasonName=(season:number|undefined)=>season==null?'Episodes':season===0?'Specials':`Season ${season}`;
export default function EpisodeList({meta,episode,history,onSelect}:{meta:Meta;episode?:string;history:ProgressMap;onSelect:(id:string)=>void}){
  const episodes=meta.videos?.filter(v=>v.episode!=null)??[];
  // Specials sort after the numbered seasons, as most providers list them.
  const seasons=[...new Set(episodes.map(v=>v.season))].sort((a,b)=>(a===0?Infinity:a??-1)-(b===0?Infinity:b??-1));
  const selectedSeason=episodes.find(v=>v.id===episode)?.season;
  const [season,setSeason]=useState(selectedSeason??seasons[0]);
  const [showAll,setShowAll]=useState(false);
  useEffect(()=>{if(episode)setSeason(selectedSeason);},[episode,selectedSeason]);
  useEffect(()=>{setShowAll(false);},[season]);
  // Keeps upcoming countdowns current to the minute while the list is open.
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  if(!episodes.length)return null;
  const inSeason=episodes.filter(v=>v.season===season),count=(s:number|undefined)=>episodes.filter(v=>v.season===s).length;
  // Long seasons show the first episodes and expand in place, so the dialog keeps a single scroll area.
  const selectedIndex=inSeason.findIndex(v=>v.id===episode),expanded=showAll||selectedIndex>=visibleEpisodes;
  const shown=expanded?inSeason:inSeason.slice(0,visibleEpisodes);
  return <section className="episode-list" aria-label="Episodes">
    <div className="episode-list-heading"><h3>Episodes</h3>{seasons.length>1&&seasons.length<=6&&<div className="season-tabs" role="group" aria-label="Season">{seasons.map(s=><button key={s??'none'} type="button" aria-pressed={s===season} title={`${count(s)} ${count(s)===1?'episode':'episodes'}`} onClick={()=>setSeason(s)}>{seasonName(s)}</button>)}</div>}{seasons.length>6&&<select aria-label="Season" value={season??''} onChange={e=>setSeason(e.target.value===''?undefined:Number(e.target.value))}>{seasons.map(s=><option key={s??'none'} value={s??''}>{seasonName(s)} ({count(s)} {count(s)===1?'episode':'episodes'})</option>)}</select>}</div>
    <ol>{shown.map(v=>{
      const progress=history[progressKey(meta.type,v.id)],countdown=v.released?releaseCountdown(v.released,now):undefined;
      const date=validRelease(v.released)?new Date(v.released!).toLocaleString(undefined,v.released!.includes('T')?{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}:{year:'numeric',month:'short',day:'numeric'}):'Date unannounced';
      const percent=progress?Math.min(100,Math.round(progress.position/progress.duration*100)):0;
      return <li key={v.id}><button type="button" aria-current={v.id===episode} onClick={()=>onSelect(v.id)}>
        <span className="episode-number">{v.episode}</span>
        <span className="episode-text"><strong>{v.title||v.name||`Episode ${v.episode}`}</strong><small>{date}{countdown&&<em className="episode-countdown" title="Time until release"><Clock size={12}/>{countdown}</em>}</small></span>
        {progress?.completed?<span className="episode-watched" aria-label="Watched"><Check size={15}/></span>:percent>0&&<span className="episode-progress" role="progressbar" aria-label="Playback progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width:`${percent}%`}}/></span>}
      </button></li>;
    })}</ol>
    {!expanded&&inSeason.length>visibleEpisodes&&<button type="button" className="episode-more" onClick={()=>setShowAll(true)}>Show all {inSeason.length} episodes</button>}
  </section>;
}
