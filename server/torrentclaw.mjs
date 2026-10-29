import {validHash,sizeLabel} from './piratebay.mjs';
import {detectQuality,detectCodec} from '../shared/stream-info.mjs';
import {torrentClawManifest} from '../shared/torrentclaw-manifest.mjs';

export {torrentClawManifest};
export const TORRENTCLAW_API='https://torrentclaw.com/api/v1/search';
// Optional. Anonymous reads are allowed with low IP-based limits; a key moves them to key-based limits.
const apiKey=()=>process.env.HASIMIO_TORRENTCLAW_API_KEY?.trim();
const count=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const contentId=content=>/^tt\d+$/.test(content?.imdbId)?content.imdbId:/^[1-9]\d*$/.test(String(content?.tmdbId))?`tmdb:${content.tmdbId}`:undefined;
const matches=(content,type,video)=>content?.contentType===(type==='series'?'show':'movie')&&(video.imdb?content.imdbId===video.imdb:String(content.tmdbId)===video.tmdb);
function parseId(type,id,episode=false){
  const match=/^(tt\d+|tmdb:[1-9]\d*)(?::(\d+):(\d+))?$/.exec(id);
  if(!['movie','series'].includes(type)||!match||(type==='movie'&&match[2])||(episode&&type==='series'&&!match[2])||(!episode&&match[2]))throw new Error('TorrentClaw supports IMDb or TMDB movies and specific series episodes.');
  return {imdb:match[1].startsWith('tt')?match[1]:undefined,tmdb:match[1].startsWith('tmdb:')?match[1].slice(5):undefined,season:match[2]===undefined?undefined:Number(match[2]),episode:match[3]===undefined?undefined:Number(match[3])};
}
async function request(params,fetchImpl){
  const url=new URL(TORRENTCLAW_API);
  for(const [key,value] of Object.entries(params))if(value!==undefined)url.searchParams.set(key,String(value));
  const key=apiKey();
  const response=await fetchImpl(url,{signal:AbortSignal.timeout(12000),redirect:'error',credentials:'omit',...(key?{headers:{Authorization:`Bearer ${key}`}}:{})});
  if(response.status===403)throw new Error('TorrentClaw refused this connection (HTTP 403). Its network may block your IP address; set HASIMIO_TORRENTCLAW_API_KEY or use another source.');
  if(!response.ok)throw new Error(`TorrentClaw returned HTTP ${response.status}.`);
  const payload=await response.json();
  if(!Array.isArray(payload?.results))throw new Error('TorrentClaw returned an invalid response.');
  return payload;
}
const image=value=>{try{const url=new URL(value,'https://torrentclaw.com');return typeof value==='string'&&value&&url.protocol==='https:'&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}};
const text=value=>typeof value==='string'?value:undefined;
export function torrentClawMeta(content,type){
  const id=contentId(content);
  if(!id||content.contentType!==(type==='series'?'show':'movie')||typeof content.title!=='string'||!content.title.trim())return undefined;
  const meta={id,type,name:content.title,poster:image(content.posterUrl),background:image(content.backdropUrl),description:text(content.overview),
    releaseInfo:Number.isInteger(content.year)?String(content.year):undefined,imdbRating:text(content.rating),genres:Array.isArray(content.genres)?content.genres.filter(g=>typeof g==='string'):[]};
  if(type==='series'){
    const videos=new Map();
    const add=(season,episode,details={})=>{
      if(!Number.isSafeInteger(season)||season<0||!Number.isSafeInteger(episode)||episode<0)return;
      const key=`${id}:${season}:${episode}`;
      videos.set(key,{id:key,season,episode,title:text(details.name),thumbnail:image(details.stillUrl),
        released:typeof details.airDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(details.airDate)&&Number.isFinite(Date.parse(details.airDate))?details.airDate:undefined});
    };
    // Known torrent episodes keep shows usable when TMDB has no episode metadata yet.
    for(const torrent of Array.isArray(content.torrents)?content.torrents:[]){
      if(!torrent)continue;
      if(torrent.episode!=null)add(torrent.season,torrent.episode);
      else for(const episode of Array.isArray(torrent.packEpisodes)?torrent.packEpisodes:[])add(torrent.season,episode);
    }
    for(const season of Array.isArray(content.seasons)?content.seasons:[])for(const episode of Array.isArray(season?.episodes)?season.episodes:[])if(episode)add(season.season,episode.episode,episode);
    meta.videos=[...videos.values()].sort((a,b)=>a.season-b.season||a.episode-b.episode);
  }
  return meta;
}
export async function catalogTorrentClaw(type,id,extras={},fetchImpl=fetch){
  if(!['movie','series'].includes(type)||id!=='discover')throw new Error('Unknown TorrentClaw catalog.');
  const skip=Number(extras.skip??0);
  if(!Number.isSafeInteger(skip)||skip<0||skip%50||skip>=50000)throw new Error('Invalid TorrentClaw catalog offset.');
  const query=String(extras.search??'').trim().slice(0,200);
  const payload=await request({type:type==='series'?'show':'movie',q:query||undefined,availability:'available',limit:50,page:skip/50+1},fetchImpl);
  const metas=payload.results.map(content=>torrentClawMeta(content,type)).filter(Boolean);
  return {metas,nextSkip:skip+50,hasMore:typeof payload.total==='number'?skip+50<payload.total:payload.results.length===50};
}
export async function metadataTorrentClaw(type,id,fetchImpl=fetch){
  const video=parseId(type,id);
  const payload=await request({imdbid:video.imdb,tmdbid:video.tmdb,type:type==='series'?'show':'movie',include:'episodes',limit:1},fetchImpl);
  const content=payload.results.find(content=>matches(content,type,video));
  const meta=content&&torrentClawMeta(content,type);
  if(!meta)throw new Error('This title is not in TorrentClaw’s catalog.');
  // Preserve the requested namespace so episode IDs also match saved TMDB titles.
  if(meta.id!==id){for(const v of meta.videos??[])v.id=`${id}:${v.season}:${v.episode}`;meta.id=id;}
  return {meta};
}
export function torrentClawResults(payload,type,video){
  if(!Array.isArray(payload?.results))throw new Error('TorrentClaw returned an invalid response.');
  const streams=[];
  for(const content of payload.results){
    if(!matches(content,type,video)||!Array.isArray(content.torrents))continue;
    for(const torrent of content.torrents){
      if(!torrent||!validHash(torrent.infoHash)||typeof torrent.rawTitle!=='string'||!torrent.rawTitle.trim()||
        /(?:^|[.\s_\-])(exe|msi|apk|bat|cmd|scr|zip|rar|7z|iso)(?=$|[.\s_\-\[\]()])/i.test(torrent.rawTitle))continue;
      if(type==='series'&&(torrent.season!==video.season||torrent.episode!==video.episode))continue;
      if(type==='movie'&&(torrent.season!=null||torrent.episode!=null))continue;
      const label=[torrent.rawTitle,torrent.quality,torrent.codec].filter(value=>typeof value==='string').join(' ');
      const quality=detectQuality(label),codec=detectCodec(label),seeders=count(torrent.seeders),sizeBytes=count(torrent.sizeBytes);
      streams.push({infoHash:torrent.infoHash.toLowerCase(),provider:'TorrentClaw',name:`TorrentClaw · ${quality==='Other'?'Torrent':quality}`,
        quality,codec,seeders,sizeBytes,filename:torrent.rawTitle,
        title:`${torrent.rawTitle}\n${seeders} seeders · ${sizeLabel(sizeBytes)}${codec==='HEVC'?' · HEVC (browser support varies)':''}`});
    }
  }
  const seen=new Set();
  return streams.sort((a,b)=>b.seeders-a.seeders).filter(stream=>{if(seen.has(stream.infoHash))return false;seen.add(stream.infoHash);return true;}).slice(0,40);
}
export async function searchTorrentClaw(type,id,fetchImpl=fetch){
  const video=parseId(type,id,true);
  const payload=await request({imdbid:video.imdb,tmdbid:video.tmdb,type:type==='series'?'show':'movie',limit:1,season:video.season,episode:video.episode},fetchImpl);
  return {streams:torrentClawResults(payload,type,video)};
}
