import {useEffect,useRef,useState} from 'react';
import {Check,Info,Play,Plus} from 'lucide-react';
import {type Meta} from './media';
import {type CardProgress} from './playback-progress';
import {backdropSources,firstImage,logoBrightness,logoSource,posterSources,probeImage,useImage} from './poster-artwork';
import {posterTitles} from './poster-registry';
import {shortEpisode,timeLeft} from './Poster';
import {useHomeIdle} from './home-idle';
import {isWebOS} from './webos/platform';
import {isAndroidTV} from './android/platform';
import {synopsis} from './synopsis';

type Props={featured:Meta;progressOf:(meta:Meta)=>CardProgress|undefined;label:(meta:Meta)=>string;saved:(meta:Meta)=>boolean;onPlay:(meta:Meta)=>void;onInfo:(meta:Meta)=>void;onToggleSave:(meta:Meta)=>void};

// How long focus must rest on a poster before the spotlight follows it, so
// moving quickly along a row does not decode an image for every poster.
const SETTLE_MS=280;
// Show the new title even if its artwork is slow, rather than stall.
const ARTWORK_WAIT_MS=1200;
// The title's name stays hidden this long while its logo loads, so the name
// does not flash before the logo replaces it.
const LOGO_WAIT_MS=1200;
// Logos darker than this (average of the brightest channel, 0–1) are replaced by the title's name. A navy logo
// scores about 0.41 and a black one 0.01; ordinary white, gold or red logos score 0.6 or more.
const DARK_LOGO=0.45;

/**
 * Discover's billboard: one title's artwork across the top of the home, its
 * logo (or name), a short description, Play and More info.
 * On the TV it follows the focused poster, as on Netflix: the top of the
 * screen shows that title's artwork and details while the shelves scroll
 * beneath it. Its buttons act on the featured title and return when focus
 * moves back up to them.
 */
export default function Hero({featured,progressOf,label,saved,onPlay,onInfo,onToggleSave}:Props){
  const section=useRef<HTMLElement>(null);
  const [preview,setPreview]=useState<Meta>();
  const idle=useHomeIdle(isWebOS||isAndroidTV);
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
        // Decode the artwork and logo first, so text and image change together.
        const logo=logoSource(meta);
        void Promise.all([firstImage(backdropSources(meta)),logo?probeImage(logo):undefined]).then(show);
        setTimeout(show,ARTWORK_WAIT_MS);
      },SETTLE_MS);
    };
    document.addEventListener('focusin',follow);
    return()=>{document.removeEventListener('focusin',follow);clearTimeout(timer);request++;root.classList.remove('tv-spotlight');};
  },[]);
  const previewing=!!preview&&!(preview.id===featured.id&&preview.type===featured.type);
  const shown=previewing?preview!:featured;
  const progress=progressOf(shown);
  // Card progress exists only for titles that were started or finished.
  const watching=!!progress&&!progress.completed;
  const featuredProgress=progressOf(featured);
  const resume=!!featuredProgress&&!featuredProgress.completed;
  const backdrop=useImage(backdropSources(shown));
  // On the TV, titles without wide artwork show their poster as key art on the right.
  const keyArt=isWebOS&&previewing&&backdrop.settled&&!backdrop.src?posterSources(shown)[0]:undefined;
  const logoUrl=logoSource(shown);
  const logo=useImage(logoUrl?[logoUrl]:[]);
  const [logoWaited,setLogoWaited]=useState(false);
  useEffect(()=>{setLogoWaited(false);const timer=setTimeout(()=>setLogoWaited(true),LOGO_WAIT_MS);return()=>clearTimeout(timer);},[logoUrl]);
  // A dark logo (navy on black, say) is unreadable over the artwork, so the title's name stands in for it.
  const [logoLight,setLogoLight]=useState<Record<string,boolean>>({});
  useEffect(()=>{const src=logo.src;if(!src||src in logoLight)return;let live=true;void logoBrightness(src).then(value=>{if(live)setLogoLight(previous=>({...previous,[src]:value===undefined||value>=DARK_LOGO}));});return()=>{live=false;};},[logo.src,logoLight]);
  const logoReady=logo.src?logoLight[logo.src]:undefined;
  const showLogo=!!logo.src&&logoReady===true;
  const title=showLogo?' has-logo':(logo.src&&logoReady===undefined&&!logoWaited)||(!logo.src&&!logo.settled&&!logoWaited)?' title-pending':'';
  const episode=watching?shortEpisode(progress!.episode):undefined;
  const kicker=watching?`Continue watching${episode?` · ${episode}`:''}`:label(shown);
  const inLibrary=saved(featured);
  return <section ref={section} aria-label={shown.name} className={`hero${isWebOS?' tv-spotlight':' billboard'}${previewing?' previewing':''}`}>
    {backdrop.src?<img key={backdrop.src} className="hero-backdrop" src={backdrop.src} alt="" onLoad={event=>event.currentTarget.classList.add('loaded')}/>
      :keyArt&&<img key={keyArt} className="hero-keyart" src={keyArt} alt="" onError={event=>{event.currentTarget.style.visibility='hidden';}}/>}
    <div className="hero-shade"/>
    <div className="hero-content">
      <span className="hero-kicker">{kicker}</span>
      <div className={'hero-title'+title}>{showLogo&&<img key={logo.src} className="hero-logo" src={logo.src} alt=""/>}<h1 className={shown.name.length>6?'long':''}>{shown.name}</h1></div>
      <div className="hero-meta">{shown.imdbRating&&<span className="rating">★ {shown.imdbRating}</span>}{shown.releaseInfo&&<span>{shown.releaseInfo}</span>}{shown.runtime&&<span>{shown.runtime}</span>}{shown.genres?.slice(0,2).map(genre=><span key={genre}>{genre}</span>)}</div>
      {shown.description&&<p>{synopsis(shown.description)}</p>}
      <div className="hero-actions">
        <button className="button primary" onClick={()=>onPlay(featured)}><Play size={19} fill="currentColor"/> {resume?'Resume':'Play'}</button>
        <button className="button secondary" onClick={()=>onInfo(featured)}><Info size={19}/> More info</button>
        <button className={`button secondary hero-save${inLibrary?' is-saved':''}`} aria-label={inLibrary?`Remove ${featured.name} from your library`:`Add ${featured.name} to your library`} title={inLibrary?'In your library':'Add to library'} onClick={()=>onToggleSave(featured)}>{inLibrary?<Check size={19}/>:<Plus size={19}/>}</button>
      </div>
      {/* Computer and phone: a short bar under the buttons. Along the hero's bottom edge it would cut through the rows below. */}
      {watching&&!isWebOS&&<div className="hero-resume"><span className="hero-resume-track" aria-hidden="true"><span style={{width:`${Math.max(3,progress!.percent)}%`}}/></span>{timeLeft(progress!.duration-progress!.position)}</div>}
    </div>
    {watching&&isWebOS&&<div className="hero-progress" aria-hidden="true"><span style={{width:`${progress!.percent}%`}}/></div>}
    {idle.stage!=='none'&&<div className="home-idle-layer" aria-hidden="true"><span className="home-idle-mark" style={{left:`${6+idle.spot[0]*64}%`,top:`${8+idle.spot[1]*78}%`}}><Play size={14} fill="currentColor"/>hasimio</span></div>}
  </section>;
}
