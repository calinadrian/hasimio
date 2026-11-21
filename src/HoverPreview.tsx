import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown,Play,Plus} from 'lucide-react';
import {type Meta} from './media';
import {type CardProgress} from './playback-progress';
import {backdropSources,posterSources} from './poster-artwork';
import {posterTitles} from './poster-registry';
import {ArtImage} from './PosterImage';
import {mediaKind,shortEpisode,timeLeft} from './Poster';

type Props={progressOf:(meta:Meta)=>CardProgress|undefined;saved:(meta:Meta)=>boolean;onPlay:(meta:Meta)=>void;onInfo:(meta:Meta)=>void;onToggleSave:(meta:Meta)=>void};
type Shown={meta:Meta;element:Element;rect:DOMRect;wide:boolean};

// A resting pointer, not a passing one, opens the card.
const OPEN_DELAY_MS=450;
// Room for the card's text and buttons below its artwork.
const BODY_HEIGHT=172;
const EDGE=16;

/**
 * Desktop only: resting the mouse on a poster grows it into a card with the
 * title's wide artwork, Play, Add to library and More info, as on Netflix.
 * Keyboard, touch and TV remotes keep the plain posters.
 */
export default function HoverPreview({progressOf,saved,onPlay,onInfo,onToggleSave}:Props){
  const [shown,setShown]=useState<Shown>();
  const panel=useRef<HTMLDivElement>(null),hideRef=useRef(()=>{});
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined,pending:Element|null=null;
    // Forgetting the pending poster lets the same one open again later.
    const hide=()=>{clearTimeout(timer);pending=null;setShown(undefined);};
    hideRef.current=hide;
    const over=(event:PointerEvent)=>{
      if(event.pointerType&&event.pointerType!=='mouse')return;
      const target=event.target instanceof Element?event.target:null;
      if(!target||panel.current?.contains(target))return;
      const poster=target.closest('.page-content .poster-card');
      if(poster===pending)return;
      clearTimeout(timer);pending=poster;
      setShown(current=>current&&current.element===poster?current:undefined);
      const meta=poster&&!poster.closest('dialog')?posterTitles.get(poster):undefined;
      if(!poster||!meta)return;
      timer=setTimeout(()=>{
        const image=poster.querySelector('.poster-image');
        if(!poster.isConnected||!image||!poster.matches(':hover')||document.querySelector('dialog[open]'))return;
        setShown({meta,element:poster,rect:image.getBoundingClientRect(),wide:poster.classList.contains('wide-card')});
      },OPEN_DELAY_MS);
    };
    document.addEventListener('pointerover',over);
    document.documentElement.addEventListener('mouseleave',hide);
    window.addEventListener('scroll',hide,{passive:true,capture:true});
    window.addEventListener('blur',hide);
    document.addEventListener('keydown',hide);
    return()=>{clearTimeout(timer);document.removeEventListener('pointerover',over);document.documentElement.removeEventListener('mouseleave',hide);window.removeEventListener('scroll',hide,{capture:true});window.removeEventListener('blur',hide);document.removeEventListener('keydown',hide);};
  },[]);
  if(!shown)return null;
  const {meta,rect,wide}=shown;
  const width=Math.min(innerWidth-EDGE*2,wide?rect.width*1.45:Math.max(rect.width*2.1,300));
  const artHeight=width*9/16;
  const left=Math.max(EDGE,Math.min(rect.left+rect.width/2-width/2,innerWidth-EDGE-width));
  const top=Math.max(EDGE,Math.min(rect.top+rect.height/2-artHeight/2,innerHeight-EDGE-artHeight-BODY_HEIGHT));
  const progress=progressOf(meta),watching=!!progress&&!progress.completed;
  const inLibrary=saved(meta);
  const act=(action:(meta:Meta)=>void)=>()=>{setShown(undefined);action(meta);};
  return <div className="hover-card" ref={panel} role="group" aria-label={meta.name} style={{left,top,width}} onPointerLeave={event=>{if(event.pointerType==='mouse')hideRef.current();}}>
    <button className="hover-card-art" style={{height:artHeight}} aria-label={`More about ${meta.name}`} onClick={act(onInfo)}>
      <ArtImage sources={[...backdropSources(meta,'small'),...posterSources(meta)]} loading="eager"/>
      <strong>{meta.name}</strong>
      {watching&&<span className="hover-card-track" aria-hidden="true"><span style={{width:`${Math.max(3,progress!.percent)}%`}}/></span>}
    </button>
    <div className="hover-card-body">
      <div className="hover-card-actions">
        <button className="round primary" aria-label={`${watching?'Resume':'Play'} ${meta.name}`} title={watching?'Resume':'Play'} onClick={act(onPlay)}><Play size={19} fill="currentColor"/></button>
        <button className={`round${inLibrary?' is-saved':''}`} aria-label={inLibrary?`Remove ${meta.name} from your library`:`Add ${meta.name} to your library`} title={inLibrary?'In your library':'Add to library'} onClick={()=>onToggleSave(meta)}>{inLibrary?<Check size={19}/>:<Plus size={19}/>}</button>
        <button className="round push" aria-label={`More about ${meta.name}`} title="More info" onClick={act(onInfo)}><ChevronDown size={20}/></button>
      </div>
      <div className="hover-card-meta">{meta.imdbRating&&<span>★ {meta.imdbRating}</span>}{meta.releaseInfo&&<span>{meta.releaseInfo}</span>}{meta.runtime&&<span>{meta.runtime}</span>}<span className="badge">{mediaKind(meta)}</span></div>
      {watching&&<div className="hover-card-progress">{shortEpisode(progress!.episode)&&<b>{shortEpisode(progress!.episode)}</b>}{timeLeft(progress!.duration-progress!.position)}</div>}
      {!!meta.genres?.length&&<div className="hover-card-genres">{meta.genres.slice(0,3).map(genre=><span key={genre}>{genre}</span>)}</div>}
    </div>
  </div>;
}
