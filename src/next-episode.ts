import {releasedEpisodes,type Meta,type Video} from './media';

export type EpisodeAction={label:string;title?:string;thumbnail?:string;onPlay:()=>void};

// Same order as the episode list: specials after numbered seasons, then episode number.
const seasonRank=(season:number|undefined)=>season===0?Infinity:season??-1;

export function orderedEpisodes(meta:Meta):Video[] {
  return (meta.videos??[])
    .filter(video=>video.episode!=null)
    .sort((a,b)=>seasonRank(a.season)-seasonRank(b.season)||(a.episode??0)-(b.episode??0));
}

// The next episode is offered only once it is out; one still to air has nothing to play yet.
export function adjacentEpisodes(meta:Meta|undefined,videoId?:string,now=Date.now()):{previous?:Video;next?:Video} {
  if(!meta||!videoId)return {};
  const episodes=orderedEpisodes(meta),index=episodes.findIndex(video=>video.id===videoId);
  if(index<0)return {};
  const following=episodes[index+1];
  return {previous:episodes[index-1],next:following&&releasedEpisodes(episodes,now).includes(following)?following:undefined};
}

export function nextEpisode(meta:Meta|undefined,videoId?:string):Video|undefined {
  return adjacentEpisodes(meta,videoId).next;
}
