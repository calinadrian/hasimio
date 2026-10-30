import {useState} from 'react';
import {type Meta} from './media';
import {posterSources} from './poster-artwork';

export default function PosterImage({meta,loading='lazy'}:{meta:Meta;loading?:'lazy'|'eager'}){
  const sources=posterSources(meta);
  // Reset failures whenever the title or its supplied artwork changes. A keyed
  // child also keeps late errors from a previous title out of the new image.
  return <ImageSources key={JSON.stringify([meta.id,...sources])} sources={sources} loading={loading}/>;
}
function ImageSources({sources,loading}:{sources:string[];loading:'lazy'|'eager'}){
  const [attempt,setAttempt]=useState(0);
  const src=sources[attempt];
  return src?<img key={src} src={src} alt="" loading={loading} decoding="async" onError={()=>setAttempt(attempt+1)}/>:null;
}
