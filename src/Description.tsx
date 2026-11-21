import {useLayoutEffect,useRef,useState} from 'react';
import {isWebOS} from './webos/platform';

/** A title's description, cut to three lines with More / Less when it runs longer. The TV shows it whole:
 *  an extra remote stop for a text toggle costs more than it saves. */
export default function Description({text}:{text:string}){
  const paragraph=useRef<HTMLParagraphElement>(null);
  const [open,setOpen]=useState(false),[long,setLong]=useState(false);
  useLayoutEffect(()=>{
    setOpen(false);
    const element=paragraph.current;if(!element||isWebOS)return;
    const measure=()=>setLong(element.scrollHeight-element.clientHeight>2);
    measure();const resize=new ResizeObserver(measure);resize.observe(element);return()=>resize.disconnect();
  },[text]);
  const clamp=!isWebOS&&!open;
  return <div className="description-block">
    <p ref={paragraph} className={`description${clamp?' description-clamped':''}`}>{text}</p>
    {!isWebOS&&(long||open)&&<button type="button" className="description-toggle" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Less':'More'}</button>}
  </div>;
}
