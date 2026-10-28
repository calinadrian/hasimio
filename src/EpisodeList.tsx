import {useEffect,useRef,useState} from 'react';
import {Check} from 'lucide-react';
import {type Meta,validRelease} from './media';
import {progressKey,type ProgressMap} from './playback-progress';

const seasonName=(season:number|undefined)=>season==null?'Episodes':season===0?'Specials':`Season ${season}`;
export default function EpisodeList({meta,episode,history,onSelect}:{meta:Meta;episode?:string;history:ProgressMap;onSelect:(id:string)=>void}){
  const episodes=meta.videos?.filter(v=>v.episode!=null)??[];
  // Specials sort after the numbered seasons, as most providers list them.
  const seasons=[...new Set(episodes.map(v=>v.season))].sort((a,b)=>(a===0?Infinity:a??-1)-(b===0?Infinity:b??-1));
  const selectedSeason=episodes.find(v=>v.id===episode)?.season;
  const [season,setSeason]=useState(selectedSeason??seasons[0]);
  const list=useRef<HTMLOListElement>(null);
  useEffect(()=>{if(episode)setSeason(selectedSeason);},[episode,selectedSeason]);
  useEffect(()=>{const box=list.current,row=box?.querySelector<HTMLElement>('[aria-current="true"]');if(box&&row)box.scrollTop=row.offsetTop-box.clientHeight/2+row.clientHeight/2;},[season,episode]);
  if(!episodes.length)return null;
  const now=Date.now();
  return <section className="episode-list" aria-label="Episodes">
    <div className="episode-list-heading"><h3>Episodes</h3>{seasons.length>1&&<select aria-label="Season" value={season??''} onChange={e=>setSeason(e.target.value===''?undefined:Number(e.target.value))}>{seasons.map(s=><option key={s??'none'} value={s??''}>{seasonName(s)} · {episodes.filter(v=>v.season===s).length}</option>)}</select>}</div>
    <ol ref={list}>{episodes.filter(v=>v.season===season).map(v=>{
      const progress=history[progressKey(meta.type,v.id)],upcoming=validRelease(v.released)&&Date.parse(v.released!)>now;
      const percent=progress?Math.min(100,Math.round(progress.position/progress.duration*100)):0;
      return <li key={v.id}><button type="button" aria-current={v.id===episode} onClick={()=>onSelect(v.id)}>
        <span className="episode-number">{v.episode}</span>
        <span className="episode-text"><strong>{v.title||v.name||`Episode ${v.episode}`}</strong><small>{validRelease(v.released)?new Date(v.released!).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Date unannounced'}{upcoming&&<em>Upcoming</em>}</small></span>
        {progress?.completed?<span className="episode-watched" aria-label="Watched"><Check size={15}/></span>:percent>0&&<span className="episode-progress" role="progressbar" aria-label="Playback progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width:`${percent}%`}}/></span>}
      </button></li>;
    })}</ol>
  </section>;
}
