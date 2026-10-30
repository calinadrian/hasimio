import type {Meta,Video} from './media';

// Same order as the episode list: specials after numbered seasons, then episode number.
const seasonRank=(season:number|undefined)=>season===0?Infinity:season??-1;

export function orderedEpisodes(meta:Meta):Video[] {
  return (meta.videos??[])
    .filter(video=>video.episode!=null)
    .sort((a,b)=>seasonRank(a.season)-seasonRank(b.season)||(a.episode??0)-(b.episode??0));
}

export function nextEpisode(meta:Meta|undefined,videoId?:string):Video|undefined {
  if(!meta||!videoId)return;
  const episodes=orderedEpisodes(meta),index=episodes.findIndex(video=>video.id===videoId);
  return index<0?undefined:episodes[index+1];
}
