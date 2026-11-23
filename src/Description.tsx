import {useLayoutEffect,useRef,useState} from 'react';
import {isWebOS} from './webos/platform';
import {synopsis} from './synopsis';

/** A title's description, cut to three lines with More / Less when it runs longer. The TV shows it whole:
 *  an extra remote stop for a text toggle costs more than it saves. Encyclopedia framing (release year,
 *  cast list, production notes) is left out until More, so the story comes first. */
export default function Description({text}:{text:string}){
  const paragraph=useRef<HTMLParagraphElement>(null);
  const [open,setOpen]=useState(false),[long,setLong]=useState(false);
  const short=synopsis(text),trimmed=short!==text.trim();
  useLayoutEffect(()=>{
    setOpen(false);
    const element=paragraph.current;if(!element||isWebOS)return;
    const measure=()=>setLong(element.scrollHeight-element.clientHeight>2);
    measure();const resize=new ResizeObserver(measure);resize.observe(element);return()=>resize.disconnect();
  },[text]);
  const clamp=!isWebOS&&!open;
  return <div className="description-block">
    <p ref={paragraph} className={`description${clamp?' description-clamped':''}`}>{open||isWebOS?text:short}</p>
    {!isWebOS&&(long||open||trimmed)&&<button type="button" className="description-toggle" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Less':'More'}</button>}
  </div>;
}
