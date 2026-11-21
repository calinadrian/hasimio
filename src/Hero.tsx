import {useEffect,useRef,useState} from 'react';
import {Check,Info,Play,Plus} from 'lucide-react';
import {type Meta,safeHttp} from './media';
import {type CardProgress} from './playback-progress';
import {posterSources} from './poster-artwork';
import {posterTitles} from './poster-registry';
import {isWebOS} from './webos/platform';

type Props={featured:Meta;resuming:boolean;progressOf:(meta:Meta)=>CardProgress|undefined;label:(meta:Meta)=>string;saved:(meta:Meta)=>boolean;onOpen:(meta:Meta)=>void;onToggleSave:(meta:Meta)=>void};

// How long focus must rest on a poster before the spotlight follows it, so
// moving quickly along a row does not decode an image for every poster.
const SETTLE_MS=280;
// Show the new title even if its artwork is slow, rather than stall.
const ARTWORK_WAIT_MS=1200;

/**
 * Discover's spotlight. On the TV it follows the focused poster, as on
 * Netflix: the top of the screen shows that title's artwork and details while
 * the shelves scroll beneath it. Its buttons act on the featured title and
 * return when focus moves back up to them.
 */
export default function Hero({featured,resuming,progressOf,label,saved,onOpen,onToggleSave}:Props){
  const section=useRef<HTMLElement>(null);
  const [preview,setPreview]=useState<Meta>();
  useEffect(()=>{
    if(!isWebOS)return;
    const root=document.documentElement;root.classList.add('tv-spotlight');
    let timer:ReturnType<typeof setTimeout>|undefined,request=0;
    const follow=(event:FocusEvent)=>{
      const target=event.target instanceof Element?event.target:undefined;
      if(!target)return;
      // Back on the spotlight's own buttons or the search bar: show the featured title again.
      if(section.current?.contains(target)||target.closest('.topbar')){clearTimeout(timer);request++;setPreview(undefined);return;}
      const card=target.closest('.poster-card');
      const meta=card&&!card.closest('dialog')?posterTitles.get(card):undefined;
      if(!meta)return;
      clearTimeout(timer);const current=++request;
      timer=setTimeout(()=>{
        const show=()=>{if(current===request)setPreview(meta);};
        const art=safeHttp(meta.background)??posterSources(meta)[0];
        if(!art){show();return;}
        // Decode the artwork first, so text and image change together.
        const image=new Image();image.onload=show;image.onerror=show;image.src=art;
        setTimeout(show,ARTWORK_WAIT_MS);
      },SETTLE_MS);
    };
    document.addEventListener('focusin',follow);
    return()=>{document.removeEventListener('focusin',follow);clearTimeout(timer);request++;root.classList.remove('tv-spotlight');};
  },[]);
  const previewing=!!preview&&!(preview.id===featured.id&&preview.type===featured.type);
  const shown=previewing?preview!:featured;
  const progress=previewing?progressOf(shown):resuming?progressOf(featured):undefined;
  // Card progress exists only for titles that were started or finished.
  const watching=!!progress&&!progress.completed;
  const backdrop=safeHttp(shown.background);
  // Titles without wide artwork show their poster as key art on the right.
  const keyArt=!backdrop&&previewing?posterSources(shown)[0]:undefined;
  const kicker=watching?`Continue watching${progress?.episode?` · ${progress.episode}`:''}`:previewing?label(shown):'Featured pick';
  return <section ref={section} className={`hero${isWebOS?' tv-spotlight':''}${previewing?' previewing':''}`}>
    {backdrop?<img key={backdrop} className="hero-backdrop" src={backdrop} alt="" onError={event=>{event.currentTarget.style.visibility='hidden';}}/>
      :keyArt&&<img key={keyArt} className="hero-keyart" src={keyArt} alt="" onError={event=>{event.currentTarget.style.visibility='hidden';}}/>}
    <div className="hero-shade"/>
    <div className="hero-content">
      <span className="hero-kicker">{kicker}</span>
      <h1 className={shown.name.length>6?'long':''}>{shown.name}</h1>
      <div className="hero-meta">{shown.imdbRating&&<span className="rating">★ {shown.imdbRating}</span>}{shown.releaseInfo&&<span>{shown.releaseInfo}</span>}{shown.runtime&&<span>{shown.runtime}</span>}<span>{label(shown)}</span>{shown.genres?.[0]&&<span>{shown.genres[0]}</span>}</div>
      {shown.description&&<p>{shown.description}</p>}
      <div className="hero-actions"><button className="button primary" onClick={()=>onOpen(featured)}>{resuming?<><Play size={17} fill="currentColor"/> Resume</>:<><Info size={18}/> Details</>}</button><button className={`button secondary ${saved(featured)?'is-saved':''}`} onClick={()=>onToggleSave(featured)}>{saved(featured)?<Check size={18}/>:<Plus size={18}/>} {saved(featured)?'In your library':'Add to library'}</button></div>
    </div>
    {watching&&<div className="hero-progress" aria-hidden="true"><span style={{width:`${progress!.percent}%`}}/></div>}
  </section>;
}
