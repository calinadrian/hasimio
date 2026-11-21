import {useEffect,useState} from 'react';
import type {Meta} from './media';
import {backdropSources,firstImage} from './poster-artwork';

type Row={items:Meta[];catalog?:{id:string;type:string}};
const titleKey=(meta:Pick<Meta,'type'|'id'>)=>`${meta.type}:${meta.id}`;
const DAY_MS=86_400_000;
/** How many candidates are checked for artwork before giving up. */
const TRIES=12;

/** The popular movies row, which also feeds the Top 10 (Hasimio Titles, or Cinemeta's "top"). */
export function popularRow<T extends Row>(rows:T[],type:'movie'|'series'):T|undefined{
  return rows.find(row=>row.catalog?.type===type&&row.catalog.id==='popular')??rows.find(row=>row.catalog?.type===type&&row.catalog.id==='top');
}

/**
 * Titles the billboard may feature: the most popular movies and series in
 * turn, then other catalog titles that bring their own wide artwork. The
 * starting point moves along each day, so the billboard changes without
 * changing while you browse.
 */
export function featuredCandidates(rows:Row[],day=Math.floor(Date.now()/DAY_MS)):Meta[]{
  const movies=popularRow(rows,'movie')?.items.slice(0,6)??[],series=popularRow(rows,'series')?.items.slice(0,6)??[];
  const alternating:Meta[]=[];
  for(let index=0;index<Math.max(movies.length,series.length);index++){if(movies[index])alternating.push(movies[index]);if(series[index])alternating.push(series[index]);}
  const others=rows.flatMap(row=>row.items).filter(meta=>meta.background&&meta.description);
  const seen=new Set<string>();
  const list=[...alternating,...others].filter(meta=>{const key=titleKey(meta);if(seen.has(key)||!backdropSources(meta).length)return false;seen.add(key);return true;});
  const start=list.length?day%Math.min(6,list.length):0;
  return [...list.slice(start),...list.slice(0,start)];
}

/**
 * The featured title: the first candidate whose wide artwork actually loads
 * (Metahub has none for some titles). Once chosen it stays while it is still
 * listed, so the billboard does not jump as catalogs finish loading.
 */
export function useFeatured(candidates:Meta[]):{featured?:Meta;settled:boolean}{
  const ids=candidates.slice(0,TRIES).map(titleKey).join('|');
  const [state,setState]=useState<{featured?:Meta;settled:boolean}>({settled:false});
  useEffect(()=>{
    const kept=state.featured&&candidates.find(meta=>titleKey(meta)===titleKey(state.featured!));
    if(kept){if(!state.settled)setState({featured:kept,settled:true});return;}
    // Rows cleared for a search, or still loading: keep what is on screen.
    if(!candidates.length){setState(previous=>previous.settled?previous:{...previous,settled:true});return;}
    let live=true;setState(previous=>({...previous,settled:false}));
    void (async()=>{
      for(const meta of candidates.slice(0,TRIES)){
        if(await firstImage(backdropSources(meta,'small'))){if(live)setState({featured:meta,settled:true});return;}
        if(!live)return;
      }
      if(live)setState(previous=>({...previous,settled:true}));
    })();
    return()=>{live=false;};
    // Keyed by the candidates' identities; their objects change as rows refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ids]);
  // The listed copy carries the newest details (ratings, artwork) for the same title.
  const current=state.featured&&(candidates.find(meta=>titleKey(meta)===titleKey(state.featured!))??state.featured);
  return {featured:current,settled:state.settled};
}
