import {stremioSources} from '../shared/stremio-sources.mjs';
import {detectQuality,detectCodec} from '../shared/stream-info.mjs';

// Debrid services, as Stremio's Torrentio configuration names them. With one
// configured, Torrentio answers with direct links: "[RD+]" marks a file the
// service already holds (it plays at once), "[RD download]" one it would
// still have to fetch.
export const DEBRID_PROVIDERS=['realdebrid','alldebrid','premiumize','debridlink','torbox','offcloud'];
/** Reads the X-Hasimio-Debrid header ("provider=key"); anything else is ignored. */
export function parseDebrid(value){
  const match=typeof value==='string'?/^([a-z]+)=([A-Za-z0-9._:@-]{8,200})$/.exec(value.trim()):null;
  return match&&DEBRID_PROVIDERS.includes(match[1])?{provider:match[1],key:match[2]}:undefined;
}
/** Separates cached searches per debrid account without keeping the key in the cache key. */
export function debridTag(debrid){
  if(!debrid)return '';
  let hash=0;for(const character of debrid.provider+'='+debrid.key)hash=(hash*31+character.charCodeAt(0))|0;
  return ':'+debrid.provider+':'+(hash>>>0).toString(36);
}
function debridState(text){
  if(/\[(?:RD|AD|PM|DL|TB|OC)\+\]/i.test(text))return 'cached';
  if(/\[(?:RD|AD|PM|DL|TB|OC)\s+download\]/i.test(text))return 'uncached';
  return undefined;
}

export function stremioResults(payload,provider){
  if(!Array.isArray(payload?.streams))throw new Error(`${provider} returned an invalid response.`);
  return {streams:payload.streams.flatMap(stream=>{
    if(!stream||typeof stream!=='object')return [];
    const hash=typeof stream.infoHash==='string'&&/^[a-f\d]{40}$/i.test(stream.infoHash)?stream.infoHash.toLowerCase():undefined;
    let url;try{const parsed=new URL(stream.url);if(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password)url=parsed.href;}catch{}
    // Informational/setup entries (externalUrl) are not playable video sources.
    if(!hash&&!url)return [];
    const filename=typeof stream.behaviorHints?.filename==='string'?stream.behaviorHints.filename:undefined;
    const name=typeof stream.name==='string'?stream.name:provider,title=typeof stream.title==='string'?stream.title:undefined;
    const text=[name,title,filename].filter(Boolean).join('\n');
    const explicitSeeders=text.match(/👤\s*([\d,]+)|([\d,]+)\s+seeders\b/i);
    const size=text.match(/([\d.]+)\s*(TB|GB|MB)\b/i);
    const debrid=url?debridState(text):undefined;
    return [{...(url?{url}:{infoHash:hash}),provider,name,title,filename,quality:detectQuality(text),codec:detectCodec(text),...(debrid?{debrid}:{}),
      ...(hash&&Number.isSafeInteger(stream.fileIdx)&&stream.fileIdx>=0?{fileIdx:stream.fileIdx}:{}),
      ...(explicitSeeders?{seeders:Number((explicitSeeders[1]??explicitSeeders[2]).replaceAll(',',''))}:{}),
      ...(size?{sizeBytes:Number(size[1])*1024**({MB:2,GB:3,TB:4}[size[2].toUpperCase()])}:{}),
    }];
  })};
}

export async function searchStremioSource(key,type,id,fetchImpl=fetch,debrid){
  const source=stremioSources[key];if(!source)throw new Error('Unknown stream source.');
  if(!['movie','series','anime'].includes(type)||!(/^(?:tt\d+(?::\d+:\d+)?|kitsu:\d+(?::\d+)?)$/.test(id))||
    (id.startsWith('tt')&&(type==='movie'?id.includes(':'):!/^tt\d+:\d+:\d+$/.test(id))))throw new Error(`${source.name} needs a movie or specific episode ID.`);
  const configured=process.env[`HASIMIO_${key.toUpperCase()}_MANIFEST_URL`]||source.manifestUrl;
  const url=new URL(configured);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.pathname.endsWith('/manifest.json'))throw new Error(`Invalid ${source.name} manifest URL.`);
  // Torrentio takes the debrid service and key as a path option, as in Stremio.
  const option=key==='torrentio'&&debrid?'/'+debrid.provider+'='+encodeURIComponent(debrid.key):'';
  url.pathname=url.pathname.replace(/\/manifest.json$/,'')+option+`/stream/${type==='anime'?'series':type}/${encodeURIComponent(id)}.json`;
  url.hash='';
  // Do not include configured URLs in errors: their paths can contain debrid keys.
  let response;try{response=await fetchImpl(url,{signal:AbortSignal.timeout(60000),redirect:'error'});}catch{throw new Error(`${source.name} could not be reached.`);}
  if(!response.ok)throw new Error(`${source.name} returned HTTP ${response.status}.${key==='comet'?' Configure HASIMIO_COMET_MANIFEST_URL or install your configured Comet manifest in Extensions.':''}`);
  let payload;try{payload=await response.json();}catch{throw new Error(`${source.name} returned an invalid response.`);}
  return stremioResults(payload,source.name);
}
