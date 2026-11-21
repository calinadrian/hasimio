import {useEffect,useRef,type ReactNode} from 'react';
import {ArrowLeft} from 'lucide-react';
import './playback-loading.css';
import {isWebOS} from './webos/platform';

// A start passes through three screens (finding a source, connecting to the
// torrent, the first video frames). One bar value carries across them, so
// the bar never jumps back when the next screen takes over.
let carried={key:'',value:0,at:0};

/** Advances the bar towards `cap`, slowing as it gets closer. */
export function creep(value:number,cap:number){
  if(value>=cap)return value;
  return Math.min(cap,value+Math.max(.15,(cap-value)*.06));
}

/**
 * The start screen: the title's artwork, its name and a thin progress bar.
 * Sources, peers and retries stay behind it; Back cancels.
 */
export default function PlaybackLoading({progressKey,title,detail,backdrop,message,cap,onCancel,failure,overlay=false}:{progressKey:string;title:string;detail?:string;backdrop?:string;message:string;cap:number;onCancel:()=>void;failure?:ReactNode;overlay?:boolean}){
  const bar=useRef<HTMLSpanElement>(null),failed=!!failure;
  useEffect(()=>{
    if(failed)return;
    // A gap of more than a few seconds means a new start, not the next stage.
    if(carried.key!==progressKey||Date.now()-carried.at>4000)carried={key:progressKey,value:0,at:Date.now()};
    const draw=()=>{carried.at=Date.now();if(bar.current)bar.current.style.transform=`scaleX(${carried.value/100})`;};
    draw();
    const timer=setInterval(()=>{carried.value=creep(carried.value,cap);draw();},200);
    return()=>clearInterval(timer);
  },[progressKey,cap,failed]);
  return <section className={'playback-loading'+(overlay?' overlay':'')} role="status" aria-label={failure?`${title} could not start`:`Starting ${title}`}>
    {backdrop&&<img className="playback-loading-art" src={backdrop} alt="" onError={event=>{event.currentTarget.style.display='none';}}/>}
    <div className="playback-loading-shade"/>
    {/* Pointer only: the remote's Back key cancels (bootstrap.ts clicks .cinema-back),
        and a focusable arrow would let a stray OK cancel the start. */}
    {isWebOS?<div role="button" className="cinema-back playback-loading-back" onClick={onCancel} aria-label="Back"><ArrowLeft size={24}/></div>
      :<button type="button" className="cinema-back playback-loading-back" onClick={onCancel} aria-label="Back" title="Back"><ArrowLeft size={24}/></button>}
    <div className="playback-loading-body">
      <h2>{title}</h2>
      {detail&&<p className="playback-loading-detail">{detail}</p>}
      {failure?<div className="playback-loading-failure">{failure}</div>:<>
        <div className="playback-loading-bar" aria-hidden="true"><span ref={bar}/></div>
        <p className="playback-loading-message">{message}</p>
      </>}
    </div>
  </section>;
}
