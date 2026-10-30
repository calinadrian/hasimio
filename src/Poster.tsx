import {Check,Film,Info} from 'lucide-react';
import {type Meta} from './media';
import PosterImage from './PosterImage';
import {type CardProgress} from './playback-progress';
import {playbackTime} from './player-utils';

export default function Poster({meta,onClick,saved,progress}:{meta:Meta;onClick:()=>void;saved:boolean;progress?:CardProgress}){
  const label=meta.category==='anime'||meta.type==='anime'?'Anime':meta.type==='series'?'Series':'Movie';
  const status=progress?.completed?(progress.episode?`${progress.episode} · Watched`:'Watched'):(progress?.episode??'Continue');
  return <button className="poster-card" onClick={onClick}>
    <div className="poster-image">
      <PosterImage meta={meta}/>
      <Film className="poster-placeholder"/>{saved&&<span className="saved-mark"><Check size={14}/></span>}
      <span className="poster-open"><Info size={26}/></span>
    </div>
    <strong>{meta.name}</strong><span>{meta.releaseInfo||'Year unavailable'} <i/> {label}</span>
    {progress&&<div className="poster-playback">
      <div className="poster-playback-caption"><span>{status}</span><span>{progress.percent}%</span></div>
      <div className="poster-playback-track" role="progressbar" aria-label={`${meta.name}${progress.episode?` ${progress.episode}`:''} playback progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={progress.completed?'Watched':`${playbackTime(progress.position)} of ${playbackTime(progress.duration)}`}><span style={{width:`${progress.percent}%`}}/></div>
      {!(progress.completed&&progress.manual)&&<small>{playbackTime(progress.completed?progress.duration:progress.position)} <span>/ {playbackTime(progress.duration)}</span></small>}
    </div>}
  </button>;
}
