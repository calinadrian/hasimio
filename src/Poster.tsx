import {Check,Film,Play} from 'lucide-react';
import {type Meta,safeHttp} from './media';
import PosterImage,{ArtImage} from './PosterImage';
import {backdropSources,posterSources} from './poster-artwork';
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
export function mediaKind(meta:Meta){return meta.category==='anime'||meta.type==='anime'?'Anime':meta.type==='series'?'Series':'Movie';}

function ProgressTrack({meta,progress}:{meta:Meta;progress:CardProgress}){
  return <span className="poster-playback-track" role="progressbar" aria-label={`${meta.name}${progress.episode?` ${progress.episode}`:''} playback progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${playbackTime(progress.position)} of ${playbackTime(progress.duration)}`}><span style={{width:`${Math.max(3,progress.percent)}%`}}/></span>;
}

/**
 * Every card has the same three parts (poster, one title line, one info line),
 * so cards in a row line up exactly. In progress, the info line says where you
 * are and how long is left, and the bar runs along the poster's bottom edge.
 * A ranked card (Top 10) puts its large outlined number beside the poster.
 */
export default function Poster({meta,onClick,saved,progress,rank}:{meta:Meta;onClick:()=>void;saved:boolean;progress?:CardProgress;rank?:number}){
  const label=mediaKind(meta);
  const status=progress?.status??(progress?.completed?'Watched':progress?.episode??'Continue');
  const accessibleLabel=[rank?`Number ${rank}`:'',meta.name,meta.releaseInfo||'Year unavailable',label,saved?'In your library':'',progress?status:''].filter(Boolean).join(', ');
  const watching=!!progress&&!progress.completed;
  const episode=watching?shortEpisode(progress.episode):undefined;
  return <button ref={element=>{if(element)posterTitles.set(element,meta);}} className={'poster-card'+(watching?' is-watching':'')+(rank?' ranked':'')} aria-label={accessibleLabel} onClick={onClick}>
    {rank!==undefined&&<span className="rank-number" aria-hidden="true">{rank}</span>}
    <div className="poster-image">
      <PosterImage meta={meta}/>
      <Film className="poster-placeholder" aria-hidden="true"/>
      {saved&&<span className="saved-mark" title="In your library" aria-hidden="true"><Check size={13} strokeWidth={3}/></span>}
      <span className="poster-open" aria-hidden="true"><Play size={28} fill="currentColor" aria-hidden="true"/></span>
      {progress?.completed&&<span className="poster-tag" title={status}><Check size={12} strokeWidth={3}/>{finishedTag(status)}</span>}
      {watching&&<ProgressTrack meta={meta} progress={progress}/>}
    </div>
    <strong title={meta.name}>{meta.name}</strong>
    {watching
      ?<span className="poster-meta is-progress" title={status}>{episode&&<><b>{episode}</b><i aria-hidden="true"/></>}{timeLeft(progress.duration-progress.position)}</span>
      :<span className="poster-meta">{meta.releaseInfo||'Year unavailable'}<i aria-hidden="true"/>{label}</span>}
  </button>;
}

/**
 * Continue watching: a wide frame from the episode in progress (or the title's
 * backdrop), the progress bar along its edge, then the title and time left.
 */
export function WideCard({meta,onClick,progress,still}:{meta:Meta;onClick:()=>void;progress?:CardProgress;still?:string}){
  const watching=!!progress&&!progress.completed;
  const episode=watching?shortEpisode(progress.episode):undefined;
  const status=progress?.status??(progress?.completed?'Watched':progress?.episode??'Continue');
  const sources=[...new Set([safeHttp(still),...backdropSources(meta,'small'),...posterSources(meta)].filter((source):source is string=>!!source))];
  return <button ref={element=>{if(element)posterTitles.set(element,meta);}} className={'poster-card wide-card'+(watching?' is-watching':'')} aria-label={[meta.name,mediaKind(meta),progress?status:''].filter(Boolean).join(', ')} onClick={onClick}>
    <div className="poster-image">
      <ArtImage sources={sources}/>
      <Film className="poster-placeholder" aria-hidden="true"/>
      <span className="poster-open" aria-hidden="true"><Play size={26} fill="currentColor" aria-hidden="true"/></span>
      {watching&&<ProgressTrack meta={meta} progress={progress}/>}
    </div>
    <strong title={meta.name}>{meta.name}</strong>
    {watching
      ?<span className="poster-meta is-progress" title={status}>{episode&&<><b>{episode}</b><i aria-hidden="true"/></>}{timeLeft(progress.duration-progress.position)}</span>
      :<span className="poster-meta">{meta.releaseInfo||'Year unavailable'}<i aria-hidden="true"/>{mediaKind(meta)}</span>}
  </button>;
}
