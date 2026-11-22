import {sameLanguage} from './playback-tracks';

type Ranked={id:string;language:string;match:number;provider?:string};
export const DEFAULT_PROVIDER='OpenSubtitles';
export const SUBTITLE_SOURCES='OpenSubtitles · subs.ro · Subtitrari-noi.ro · YIFY · Addic7ed';

/**
 * Versions to try, in order, when subtitles load automatically. The closest releases come first; then
 * every other site gets a turn with its best version, so one site that is down, rate-limited or only
 * has broken files cannot use up every attempt.
 */
export function automaticCandidates<T extends Ranked>(results:readonly T[],language:string,limit=8):T[]{
  const wanted=results.filter(item=>sameLanguage(item.language,language));
  const order=wanted.slice(0,3),providers=new Set(order.map(item=>item.provider??DEFAULT_PROVIDER));
  for(const item of wanted){const provider=item.provider??DEFAULT_PROVIDER;if(!providers.has(provider)){providers.add(provider);order.push(item);}}
  for(const item of wanted)if(!order.includes(item))order.push(item);
  return order.slice(0,limit);
}

/** Sites that answered for this language, for the subtitles panel heading. */
export function sourceNames(results:readonly Ranked[],language:string){
  const names=[...new Set(results.filter(item=>sameLanguage(item.language,language)).map(item=>item.provider??DEFAULT_PROVIDER))];
  return names.length?names.join(' · '):SUBTITLE_SOURCES;
}
