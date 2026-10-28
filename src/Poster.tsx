import {Check,Film,Play} from 'lucide-react';
import {type Meta,safeHttp} from './media';
import {type CardProgress} from './playback-progress';
import {playbackTime} from './player-utils';

export default function Poster({meta,onClick,saved,progress}:{meta:Meta;onClick:()=>void;saved:boolean;progress?:CardProgress}){
  const label=meta.category==='anime'||meta.type==='anime'?'Anime':meta.type==='series'?'Series':'Movie';
  const status=progress?.completed?(progress.episode?`${progress.episode} · Watched`:'Watched'):(progress?.episode??'Continue');
  return <button className="poster-card" onClick={onClick}>
    <div className="poster-image">
      {safeHttp(meta.poster)?<img src={safeHttp(meta.poster)} alt="" loading="lazy" onError={e=>{e.currentTarget.style.visibility='hidden';}}/>:null}
      <Film className="poster-placeholder"/>{saved&&<span className="saved-mark"><Check size={14}/></span>}
      <span className="poster-open"><Play size={24} fill="currentColor"/></span>
    </div>
    <strong>{meta.name}</strong><span>{meta.releaseInfo||'Year unavailable'} <i/> {label}</span>
    {progress&&<div className="poster-playback">
      <div className="poster-playback-caption"><span>{status}</span><span>{progress.percent}%</span></div>
      <div className="poster-playback-track" role="progressbar" aria-label={`${meta.name}${progress.episode?` ${progress.episode}`:''} playback progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={progress.completed?'Watched':`${playbackTime(progress.position)} of ${playbackTime(progress.duration)}`}><span style={{width:`${progress.percent}%`}}/></div>
      <small>{playbackTime(progress.completed?progress.duration:progress.position)} <span>/ {playbackTime(progress.duration)}</span></small>
    </div>}
  </button>;
}
