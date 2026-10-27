import {detectQuality,detectCodec} from '../shared/stream-info.mjs';
export const pirateBayManifest = {
  id:'org.hasimio.piratebay',name:'The Pirate Bay',version:'1.0.0',
  description:'Find torrent sources in The Pirate Bay index via APIBay. Playback buffers through Hasimio’s local streaming service.',
  resources:['stream'],types:['movie','series'],idPrefixes:['tt'],catalogs:[],
};
export const validHash = value => typeof value === 'string' && /^[a-f\d]{40}$/i.test(value);
export function parseVideoId(type,id) {
  const match=/^(tt\d+)(?::(\d+):(\d+))?$/.exec(id);
  if (!match || !['movie','series'].includes(type) || (type === 'series' && !match[2])) throw new Error('Choose a movie or a specific series episode first.');
  return {imdb:match[1],season:match[2] ? Number(match[2]) : undefined,episode:match[3] ? Number(match[3]) : undefined};
}
export function sizeLabel(size) { return Number(size)>=1024**3 ? `${(Number(size)/1024**3).toFixed(1)} GB` : `${Math.round(Number(size)/1024**2)} MB`; }
export function torrentResults(rows,imdb) {
  if (!Array.isArray(rows)) throw new Error('The Pirate Bay search returned an invalid response.');
  const qualityCounts=new Map();
  return [...new Map(rows.filter(row => row && validHash(row.info_hash) && typeof row.name === 'string' && Number(row.category)>=200 && Number(row.category)<300 && (!row.imdb || row.imdb === imdb) && !/\.(exe|msi|apk|zip|rar|iso)(\s|$)/i.test(row.name)).map(row => [row.info_hash.toLowerCase(),row])).values()]
    .sort((a,b) => Number(b.seeders)-Number(a.seeders)).filter(row=>{const quality=detectQuality(row.name),count=qualityCounts.get(quality)||0;if(count>=8)return false;qualityCounts.set(quality,count+1);return true;}).map(row => ({
      infoHash:row.info_hash.toLowerCase(),provider:'The Pirate Bay',
      name:`The Pirate Bay · ${detectQuality(row.name)==='Other'?'Torrent':detectQuality(row.name)}`,
      quality:detectQuality(row.name),seeders:Math.max(0,Number(row.seeders)||0),sizeBytes:Math.max(0,Number(row.size)||0),codec:detectCodec(row.name),filename:row.name,
      title:`${row.name}\n${Math.max(0,Number(row.seeders)||0)} seeders · ${sizeLabel(row.size)}${/hevc|x265|h265/i.test(row.name) ? ' · HEVC (browser support varies)' : ''}`,
    }));
}
export async function searchPirateBay(type,id,fetchImpl=fetch) {
  const video=parseVideoId(type,id);
  async function search(query) { const url=new URL('https://apibay.org/q.php');url.searchParams.set('q',query);url.searchParams.set('cat','200');const response=await fetchImpl(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`The Pirate Bay index returned HTTP ${response.status}.`);return torrentResults(await response.json(),video.imdb); }
  if (type === 'movie') {const exact=await search(video.imdb);if(exact.length)return {streams:exact};}
  const response=await fetchImpl(`https://v3-cinemeta.strem.io/meta/${type}/${video.imdb}.json`,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Could not resolve the title for torrent search.');
  const {meta}=await response.json();if(!meta?.name)throw new Error('No title metadata was found.');
  const name=meta.name.replace(/[^\p{L}\p{N} .'-]/gu,' ').trim();
  const suffix=type === 'series' ? `S${String(video.season).padStart(2,'0')}E${String(video.episode).padStart(2,'0')}` : (meta.releaseInfo?.match(/^\d{4}/)?.[0] ?? '');
  let streams=await search(`${name} ${suffix}`);
  if(!streams.length && type === 'series')streams=await search(`${name} S${String(video.season).padStart(2,'0')}`);
  return {streams};
}
