import {useEffect,useRef,useState} from 'react';
import {type Meta} from './media';
import {posterSources} from './poster-artwork';
import {isWebOS} from './webos/platform';

export default function PosterImage({meta,loading='lazy'}:{meta:Meta;loading?:'lazy'|'eager'}){
  const sources=posterSources(meta);
  const frame=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState(!isWebOS||loading==='eager');
  useEffect(()=>{if(!isWebOS||loading==='eager'||!frame.current)return;const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin:'200px'});observer.observe(frame.current);return()=>observer.disconnect();},[loading]);
  // Reset failures whenever the title or its supplied artwork changes. A keyed
  // child also keeps late errors from a previous title out of the new image.
  const content=visible?<ImageSources key={JSON.stringify([meta.id,...sources])} sources={sources} loading={loading}/>:null;
  return isWebOS?<span className="tv-poster-frame" ref={frame}>{content}</span>:content;
}
function ImageSources({sources,loading}:{sources:string[];loading:'lazy'|'eager'}){
  const [attempt,setAttempt]=useState(0);
  const src=sources[attempt];
  return src?<img key={src} src={src} alt="" loading={loading} decoding="async" onError={()=>setAttempt(attempt+1)}/>:null;
}
