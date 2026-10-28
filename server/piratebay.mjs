import {kitsuMetadata} from '../shared/kitsu.mjs';
import {detectQuality,detectCodec} from '../shared/stream-info.mjs';
export const pirateBayManifest = {
  id:'org.hasimio.piratebay',name:'The Pirate Bay',version:'1.1.0',
  description:'Find torrent sources in The Pirate Bay index via APIBay. Playback buffers through Hasimio’s local streaming service.',
  resources:['stream'],types:['movie','series','anime'],idPrefixes:['tt','kitsu:'],catalogs:[],
};
export const validHash = value => typeof value === 'string' && /^[a-f\d]{40}$/i.test(value);
export function parseVideoId(type,id) {
  const anime=/^(kitsu:\d+)(?::(\d+))?$/.exec(id);
  if(anime && ['movie','series','anime'].includes(type) && (type === 'movie' || anime[2]))return {kitsu:anime[1],episode:anime[2] ? Number(anime[2]) : undefined};
  const match=/^(tt\d+)(?::(\d+):(\d+))?$/.exec(id);
  if (!match || !['movie','series'].includes(type) || (type === 'series' && !match[2])) throw new Error('Choose a movie or a specific series episode first.');
  return {imdb:match[1],season:match[2] ? Number(match[2]) : undefined,episode:match[3] ? Number(match[3]) : undefined};
}
export function sizeLabel(size) { return Number(size)>=1024**3 ? `${(Number(size)/1024**3).toFixed(1)} GB` : `${Math.round(Number(size)/1024**2)} MB`; }
export function torrentResults(rows,imdb) {
  if (!Array.isArray(rows)) throw new Error('The Pirate Bay search returned an invalid response.');
  const qualityCounts=new Map();
  return [...new Map(rows.filter(row => row && validHash(row.info_hash) && typeof row.name === 'string' && Number(row.category)>=200 && Number(row.category)<300 && (!/^tt\d+$/.test(row.imdb) || !imdb || row.imdb === imdb) && !/\.(exe|msi|apk|zip|rar|iso)(\s|$)/i.test(row.name)).map(row => [row.info_hash.toLowerCase(),row])).values()]
    .sort((a,b) => Number(b.seeders)-Number(a.seeders)).filter(row=>{const quality=detectQuality(row.name),count=qualityCounts.get(quality)||0;if(count>=8)return false;qualityCounts.set(quality,count+1);return true;}).map(row => ({
      infoHash:row.info_hash.toLowerCase(),provider:'The Pirate Bay',
      name:`The Pirate Bay · ${detectQuality(row.name)==='Other'?'Torrent':detectQuality(row.name)}`,
      quality:detectQuality(row.name),seeders:Math.max(0,Number(row.seeders)||0),sizeBytes:Math.max(0,Number(row.size)||0),codec:detectCodec(row.name),filename:row.name,
      title:`${row.name}\n${Math.max(0,Number(row.seeders)||0)} seeders · ${sizeLabel(row.size)}${/hevc|x265|h265/i.test(row.name) ? ' · HEVC (browser support varies)' : ''}`,
    }));
}
export async function searchPirateBay(type,id,fetchImpl=fetch) {
  const video=parseVideoId(type,id);
  let animeNames=[];
  async function search(query) { const url=new URL('https://apibay.org/q.php');url.searchParams.set('q',query);url.searchParams.set('cat','200');const response=await fetchImpl(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`The Pirate Bay index returned HTTP ${response.status}.`);const rows=await response.json();return torrentResults(Array.isArray(rows)&&animeNames.length ? rows.filter(row=>animeNames.some(name=>{
    const normalized=String(row.name ?? '').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').toLowerCase();
    const title=name.toLowerCase();const offset=normalized.indexOf(title);
    if(offset<0 || (offset>0 && normalized[offset-1]!==' '))return false;
    const rest=normalized.slice(offset+title.length);
    return /^(?:\s+(?:\d|s\d|season\b|complete\b|batch\b|collection\b)|\s*$)/i.test(rest);
  })) : rows,video.imdb); }
  if (type === 'movie' && video.imdb) {const exact=await search(video.imdb);if(exact.length)return {streams:exact};}
  let meta;
  if(video.kitsu) meta=await kitsuMetadata(video.kitsu,undefined,fetchImpl,video.episode);
  else {
    const response=await fetchImpl(`https://v3-cinemeta.strem.io/meta/${type}/${video.imdb}.json`,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Could not resolve the title for torrent search.');
    ({meta}=await response.json());
  }
  if(!meta?.name)throw new Error('No title metadata was found.');
  const clean = name => name.replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim();
  const name=clean(meta.name);
  if(video.kitsu){
    animeNames=[...new Set([name,...(meta.aliases ?? []).filter(n=>typeof n==='string').map(clean)])];
    video.imdb=meta.imdb_id;
    if(type !== 'movie'){
      const episode=meta.videos?.find(v=>v.id===id);
      if(!episode)throw new Error('The requested anime episode could not be resolved.');
      video.season=episode.imdbSeason ?? episode.season ?? 1;
      video.episode=episode.imdbEpisode ?? episode.episode;
      video.absolute=episode.absoluteEpisode ?? Number(id.split(':').at(-1));
    }
  }
  const episodic=type !== 'movie';
  const suffix=episodic ? `S${String(video.season).padStart(2,'0')}E${String(video.episode).padStart(2,'0')}` : (meta.releaseInfo?.match(/^\d{4}/)?.[0] ?? '');
  let streams=await search(`${name} ${suffix}`);
  if(!streams.length && episodic){
    const queries=[`${name} S${String(video.season).padStart(2,'0')}`];
    if(video.kitsu)queries.push(...animeNames.slice(0,2).map(n=>`${n} ${String(video.absolute).padStart(2,'0')}`));
    const results=await Promise.allSettled(queries.map(search));
    streams=[...new Map(results.flatMap(r=>r.status==='fulfilled'?r.value:[]).map(s=>[s.infoHash,s])).values()];
    if(!streams.length && results.every(r=>r.status==='rejected'))throw results[0].reason;
  }
  return {streams};
}
