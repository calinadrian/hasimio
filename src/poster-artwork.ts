import {useEffect,useState} from 'react';
import {type Meta,safeHttp} from './media';

const imdb=(id:string)=>/^tt\d+$/.test(id);
const unique=(sources:(string|undefined)[])=>[...new Set(sources.filter((source):source is string=>!!source))];

// Artwork lookup is independent of catalog/metadata providers. Catalogs can
// arrive before TVmaze's rate-limited enrichment, including cached library rows.
export function posterSources(meta:Pick<Meta,'id'|'poster'>):string[]{
  return unique([safeHttp(meta.poster),imdb(meta.id)?`https://images.metahub.space/poster/medium/${meta.id}/img`:undefined]);
}

/**
 * Wide artwork: the provider's own background first, then Metahub's by IMDb ID.
 * Hasimio Titles catalogs carry no backgrounds, so most of them come from Metahub.
 * "small" (480 px wide) suits cards; "medium" (full HD) suits the billboard.
 */
export function backdropSources(meta:Pick<Meta,'id'|'background'>,size:'small'|'medium'='medium'):string[]{
  return unique([safeHttp(meta.background),imdb(meta.id)?`https://images.metahub.space/background/${size}/${meta.id}/img`:undefined]);
}

/** A title's logo artwork (its name as designed for the poster), when it has an IMDb ID. */
export function logoSource(meta:Pick<Meta,'id'>):string|undefined{
  return imdb(meta.id)?`https://images.metahub.space/logo/medium/${meta.id}/img`:undefined;
}

// Metahub answers 404 for titles without artwork. A CSS background or a single
// URL cannot fall back by itself, so each URL is checked once and remembered,
// including the misses.
const results=new Map<string,boolean>();
const pending=new Map<string,Promise<boolean>>();
const PROBE_TIMEOUT_MS=15000;

export function probeImage(url:string):Promise<boolean>{
  const known=results.get(url);
  if(known!==undefined)return Promise.resolve(known);
  let probe=pending.get(url);
  if(!probe){
    probe=new Promise<boolean>(resolve=>{
      const image=new Image();
      // A slow answer is not a miss: it is not remembered, so a later look tries again.
      const timer=setTimeout(()=>{pending.delete(url);resolve(false);},PROBE_TIMEOUT_MS);
      const settle=(ok:boolean)=>{clearTimeout(timer);results.set(url,ok);pending.delete(url);resolve(ok);};
      image.onload=()=>settle(true);image.onerror=()=>settle(false);
      image.src=url;
    });
    pending.set(url,probe);
  }
  return probe;
}

/** The first source that loads, or undefined when none does. */
export async function firstImage(sources:string[]):Promise<string|undefined>{
  for(const source of sources)if(await probeImage(source))return source;
  return undefined;
}

/** What is already known without waiting: a source known to load, or none left to try. */
export function knownImage(sources:string[]):{src?:string;settled:boolean}{
  for(const source of sources){
    const known=results.get(source);
    if(known===undefined)return {settled:false};
    if(known)return {src:source,settled:true};
  }
  return {settled:true};
}

/** The first of these sources that loads; settled once every source has been tried. */
export function useImage(sources:string[]):{src?:string;settled:boolean}{
  const key=sources.join('\n');
  const [state,setState]=useState(()=>({key,...knownImage(sources)}));
  useEffect(()=>{
    const now=knownImage(sources);
    setState({key,...now});
    if(now.settled)return;
    let live=true;
    void firstImage(sources).then(src=>{if(live)setState({key,src,settled:true});});
    return()=>{live=false;};
    // The joined list is the dependency; a new array with the same URLs is the same request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  return state.key===key?{src:state.src,settled:state.settled}:knownImage(sources);
}
