import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronLeft,ChevronRight,LoaderCircle,RefreshCw} from 'lucide-react';
import './media-shelf.css';
import {isWebOS} from './webos/platform';
import {isAndroidArm32,isAndroidTV} from './android/platform';

const pagedCatalog=isWebOS||isAndroidArm32;

export default function MediaShelf({title,source,children,wrap=false,hasMore=false,onMore,onBrowse,onBack,expanded=false,variant}:{title:string;source?:string;children:ReactNode;wrap?:boolean;hasMore?:boolean;onMore?:()=>Promise<boolean>;onBrowse?:()=>void;onBack?:()=>void;expanded?:boolean;variant?:'wide'|'ranked'}){
  const row=useRef<HTMLDivElement>(null),busy=useRef(false),loader=useRef(onMore);
  loader.current=onMore;
  const [loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[edges,setEdges]=useState({left:false,right:false});
  async function load(){
    if(busy.current||!loader.current)return;
    busy.current=true;setLoading(true);setFailed(false);
    try{if(!await loader.current())setFailed(true);}catch{setFailed(true);}
    finally{busy.current=false;setLoading(false);}
  }
  useEffect(()=>{
    const element=row.current;if(!element)return;
    const update=()=>setEdges({left:element.scrollLeft>4,right:element.scrollWidth-element.clientWidth-element.scrollLeft>4});
    const resize=new ResizeObserver(update);resize.observe(element);
    element.addEventListener('scroll',update,{passive:true});update();
    return()=>{resize.disconnect();element.removeEventListener('scroll',update);};
  },[children,wrap]);
  useEffect(()=>{
    const element=row.current,last=element?.lastElementChild;
    if(pagedCatalog||!element||!last||!hasMore||failed||loading)return;
    // Observe the last actual card, so adding pages doesn't create empty tiles.
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void load();},{root:wrap?null:element,rootMargin:wrap?'0px 0px 400px 0px':'0px 600px 0px 0px'});
    observer.observe(last);return()=>observer.disconnect();
  },[children,hasMore,failed,loading,wrap]);
  // TV: a page swaps in the next titles. Pressing Right on the last poster
  // (bootstrap.ts reports it as an edge) loads that page and focuses its first
  // poster, instead of an extra "Next page" stop below every shelf.
  const more=useRef({hasMore,loading});more.current={hasMore,loading};
  const focusFirst=useRef(false);
  useEffect(()=>{
    const element=row.current;if(!isWebOS||!element)return;
    const edge=(event:Event)=>{
      if((event as CustomEvent<string>).detail!=='ArrowRight'||!more.current.hasMore||more.current.loading)return;
      focusFirst.current=true;void load();
    };
    element.addEventListener('hasimio:edge',edge);return()=>element.removeEventListener('hasimio:edge',edge);
  },[]);
  // The new page has rendered: continue from its first poster.
  useEffect(()=>{
    const element=row.current;if(!focusFirst.current||!element||loading)return;
    focusFirst.current=false;element.scrollLeft=0;element.querySelector<HTMLElement>('.poster-card')?.focus();
  },[children,loading]);
  const scroll=(direction:number)=>{const element=row.current;if(element)element.scrollBy({left:direction*element.clientWidth*.9,behavior:isAndroidTV||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  return <section className="media-section media-shelf" aria-label={title}>
    {onBack&&<button className="shelf-back" onClick={onBack}><ChevronLeft size={17}/>Back to Discover</button>}
    <div className="row-heading"><>{expanded?<h1>{title}</h1>:<h3>{onBrowse?<button className="shelf-heading-button" onClick={onBrowse} aria-label={`Browse all ${title}`}>{title}<ChevronRight size={18}/></button>:title}</h3>}</>{source&&<span>{source}</span>}<span className="shelf-status" role="status">{loading&&<><LoaderCircle className="spin" size={15}/>Loading titles…</>}</span>{failed&&<button className="shelf-retry" onClick={()=>void load()}><RefreshCw size={14}/>Retry loading titles</button>}{!wrap&&(edges.left||edges.right)&&<div className="shelf-controls"><button className="shelf-arrow" disabled={!edges.left} aria-label={`Scroll ${title} left`} onClick={()=>scroll(-1)}><ChevronLeft size={20}/></button><button className="shelf-arrow" disabled={!edges.right} aria-label={`Scroll ${title} right`} onClick={()=>scroll(1)}><ChevronRight size={20}/></button></div>}</div>
    <div className="shelf-stage">
      
      <div className={`poster-row${wrap?' wrap':''}${variant&&!wrap?' '+variant+'-row':''}`} ref={row} aria-label={`${title} titles`} onKeyDown={event=>{
        if(wrap||!['ArrowLeft','ArrowRight'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey)return;
        const cards=Array.from(row.current?.querySelectorAll<HTMLButtonElement>('.poster-card')??[]);
        const index=cards.indexOf(event.target as HTMLButtonElement);if(index<0)return;
        event.preventDefault();cards[index+(event.key==='ArrowRight'?1:-1)]?.focus({preventScroll:true});
      }} onFocusCapture={event=>{
        if(!wrap)(event.target as HTMLElement).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      }}>{children}</div>

    </div>
    {pagedCatalog&&!isWebOS&&hasMore&&<button className="button secondary" disabled={loading} onClick={()=>void load()}>Next page</button>}
  </section>;
}
