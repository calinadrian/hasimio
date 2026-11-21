import {Check,Film,Play} from 'lucide-react';
import {type Meta} from './media';
import PosterImage from './PosterImage';
import {posterTitles} from './poster-registry';
import {type CardProgress} from './playback-progress';
import {playbackTime} from './player-utils';
import './poster.css';

/** "51m left", "1h 39m left": readable at a glance, unlike 1:39:26. */
export function timeLeft(seconds:number){
  const minutes=Math.round(Math.max(0,seconds)/60);
  if(minutes<1)return 'Almost done';
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return (hours?`${hours}h${rest?` ${rest}m`:''}`:`${rest}m`)+' left';
}
/** "S1 · E2/10" becomes "S1 E2": the episode alone, short enough for one line. */
export function shortEpisode(episode:string|undefined){
  return episode?.replace(/\/\d+$/,'').replace(/\s*·\s*/g,' ').replace(/^Specials E/,'Special E').trim()||undefined;
}
/** A short tag for finished titles; the full status stays in the label. */
export function finishedTag(status:string){
  if(/^Caught up/i.test(status))return 'Caught up';
  const part=/^(\d+\/\d+) episodes watched$/i.exec(status);
  return part?`${part[1]} watched`:'Watched';
}

/**
 * Every card has the same three parts (poster, one title line, one info line),
 * so cards in a row line up exactly. In progress, the info line says where you
 * are and how long is left, and the bar runs along the poster's bottom edge.
 */
export default function Poster({meta,onClick,saved,progress}:{meta:Meta;onClick:()=>void;saved:boolean;progress?:CardProgress}){
  const label=meta.category==='anime'||meta.type==='anime'?'Anime':meta.type==='series'?'Series':'Movie';
  const status=progress?.status??(progress?.completed?'Watched':progress?.episode??'Continue');
  const accessibleLabel=[meta.name,meta.releaseInfo||'Year unavailable',label,saved?'In your library':'',progress?status:''].filter(Boolean).join(', ');
  const watching=!!progress&&!progress.completed;
  const episode=watching?shortEpisode(progress.episode):undefined;
  return <button ref={element=>{if(element)posterTitles.set(element,meta);}} className={'poster-card'+(watching?' is-watching':'')} aria-label={accessibleLabel} onClick={onClick}>
    <div className="poster-image">
      <PosterImage meta={meta}/>
      <Film className="poster-placeholder" aria-hidden="true"/>
      {saved&&<span className="saved-mark" title="In your library" aria-hidden="true"><Check size={13} strokeWidth={3}/></span>}
      <span className="poster-open" aria-hidden="true"><Play size={28} fill="currentColor" aria-hidden="true"/></span>
      {progress?.completed&&<span className="poster-tag" title={status}><Check size={12} strokeWidth={3}/>{finishedTag(status)}</span>}
      {watching&&<span className="poster-playback-track" role="progressbar" aria-label={`${meta.name}${progress.episode?` ${progress.episode}`:''} playback progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${playbackTime(progress.position)} of ${playbackTime(progress.duration)}`}><span style={{width:`${Math.max(3,progress.percent)}%`}}/></span>}
    </div>
    <strong title={meta.name}>{meta.name}</strong>
    {watching
      ?<span className="poster-meta is-progress" title={status}>{episode&&<><b>{episode}</b><i aria-hidden="true"/></>}{timeLeft(progress.duration-progress.position)}</span>
      :<span className="poster-meta">{meta.releaseInfo||'Year unavailable'}<i aria-hidden="true"/>{label}</span>}
  </button>;
}
