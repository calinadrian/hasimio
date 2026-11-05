import {compactTitle,parseSeasonTitle} from '../shared/kitsu.mjs';
import type {Meta} from './media';

// Two entries are the same title when they share an ID or one lists the other as a season or its IMDb entry.
export function sameTitle(a:Meta,b:Meta) {
  const lists=(meta:Meta,id:string)=>!!meta.seasonIds?.includes(id)||!!meta.imdbIds?.includes(id);
  return a.type===b.type&&(a.id===b.id||lists(a,b.id)||lists(b,a.id));
}
// IMDb lists a show once with every season. Live-action adaptations share these names, so the Animation genre is required.
export function imdbAnimeCandidate(meta:Meta) {
  return meta.type==='series'&&/^tt\d+$/.test(meta.id)&&!!meta.genres?.includes('Animation');
}
const startYear=(meta:Meta)=>{const year=Number(meta.releaseInfo?.slice(0,4));return year>0?year:undefined;};
// The anime entry for an IMDb series: same name in any language, and a start year that fits. A record of a
// later season only has to start after the show did. The first season wins when several records match.
export function imdbAnimeMatch(item:Meta,anime:Meta[]):Meta|undefined {
  const start=startYear(item);
  if(!imdbAnimeCandidate(item)||!start)return;
  const keys=[item.name,...(item.aliases??[])].map(name=>compactTitle(parseSeasonTitle(name).base)).filter(Boolean);
  const matches=anime.filter(meta=>{
    const year=startYear(meta);
    if(!isSeason(meta)||!year||!meta.seriesKeys?.some(key=>keys.includes(key)))return false;
    return seasonLabelled(meta)?year>=start-1:Math.abs(year-start)<=1;
  });
  return matches.find(meta=>!seasonLabelled(meta))??[...matches].sort((a,b)=>year(a).localeCompare(year(b)))[0];
}
// Replaces matching IMDb cards in place. `genres` comes along so the genre filter keeps finding the card.
export function mergeImdbAnime(items:Meta[],anime:Meta[],keep:(meta:Meta)=>boolean=()=>false):Meta[] {
  return items.map(item=>{
    const match=keep(item)?undefined:imdbAnimeMatch(item,anime);
    return match?{...match,genres:match.genres??item.genres}:item;
  });
}
// Puts refreshed metadata in place of every older entry for that title, keeping list order.
export function updateTitle(list:Meta[],updated:Meta) {
  const index=list.findIndex(meta=>sameTitle(meta,updated));
  if(index<0)return list;
  return list.flatMap((meta,position)=>position===index?[updated]:sameTitle(meta,updated)?[]:[meta]);
}

const seasonLabelled=(meta:Meta)=>!!meta.seasonLabel;
// Movies and side-story specials are not always reachable from the series, so they keep their own cards.
const isSeason=(meta:Meta)=>meta.type!=='movie'&&(meta.animeFormat==null||meta.animeFormat==='TV'||meta.animeFormat==='ONA');
const year=(meta:Meta)=>meta.releaseInfo??'9999';
type Group={members:Meta[];keys:Set<string>};
const hasBase=(group:Group)=>group.members.some(meta=>!seasonLabelled(meta));
// Shows one card per anime series. Titles join when any of their names match with the season removed, so
// the English and Japanese records meet. Two unlabelled records are remakes rather than seasons: both stay.
export function groupAnimeSeries(items:Meta[]):Meta[] {
  let groups:Group[]=[];
  const seen=new Set<string>();
  for(const item of items){
    // An IMDb card can become an anime that is already on the shelf.
    const identity=`${item.type}:${item.id}`;
    if(seen.has(identity))continue;
    seen.add(identity);
    const keys=isSeason(item)?item.seriesKeys??[]:[];
    const single:Group={members:[item],keys:new Set(keys)};
    // A merged card keeps the earliest position in the shelf.
    let home:Group|undefined;
    const kept:Group[]=[];
    for(const other of groups){
      if(!keys.some(key=>other.keys.has(key))||(hasBase(home??single)&&hasBase(other))){kept.push(other);continue;}
      const from=home?other:single,into=home??other;
      into.members.push(...from.members);
      from.keys.forEach(key=>into.keys.add(key));
      if(!home){home=other;kept.push(other);}
    }
    groups=home?kept:[...kept,single];
  }
  return groups.map(({members})=>{
    const lead=members.find(meta=>!seasonLabelled(meta))??[...members].sort((a,b)=>year(a).localeCompare(year(b)))[0];
    // Those own cards keep their full names, so "Mt. Natagumo Arc" stays visible.
    return isSeason(lead)&&lead.seriesName&&lead.seriesName!==lead.name?{...lead,name:lead.seriesName}:lead;
  });
}
