import {networkInterfaces} from 'node:os';
export const VIDEO_EXTENSIONS=/\.(mp4|m4v|webm|mkv|mov|avi)$/i;
export const CONTAINER_HEADER=12;
const MP4_ATOMS=new Set(['ftyp','moov','mdat','free','skip','wide','pnot']);
// A torrent's file name is only a label; its first bytes show what the file really is.
export function videoContainer(header) {
  if(header.length<CONTAINER_HEADER)return false;
  if(header.readUInt32BE(0)===0x1a45dfa3)return true;
  if(MP4_ATOMS.has(header.toString('latin1',4,8)))return true;
  return header.toString('latin1',0,4)==='RIFF'&&header.toString('latin1',8,12)==='AVI ';
}
export function selectVideo(files,videoId,fileIdx) {
  const videos=files.map((file,index)=>({index,name:file.name,length:file.length})).filter(f=>VIDEO_EXTENSIONS.test(f.name) && !/(^|[\s._-])sample([\s._-]|$)/i.test(f.name));
  if(Number.isSafeInteger(fileIdx)&&videos.some(file=>file.index===fileIdx))return {files:videos,selected:fileIdx};
  const anime=/^kitsu:\d+:(\d+)$/.exec(videoId ?? '');
  if(anime){
    const number=Number(anime[1]);
    // Prefer explicit episode markers, then bare numbers that are not part of
    // decimals such as DDP5.1, AAC 2.0 or H.264.
    const marked=new RegExp(`(?:\\s-\\s*|\\b(?:e|ep|episode)[ ._]?)0*${number}(?!\\d)(?:v\\d+)?(?![a-z])`,'i');
    const bare=new RegExp(`(?<!\\d\\.)(?:^|[ ._\\[-])0*${number}(?!\\d|\\.\\d)(?:[ ._\\]v-]|$)`,'i');
    const match=videos.find(f=>marked.test(f.name))??videos.find(f=>bare.test(f.name));
    if(match)return {files:videos,selected:match.index};
    if(videos.length>1)return {files:videos,selected:undefined};
  }
  const episode=anime ? null : /:(\d+):(\d+)$/.exec(videoId ?? '');
  if(episode) {
    const season=Number(episode[1]),number=Number(episode[2]);
    const pattern=new RegExp(`(?:s0?${season}[ ._-]*e0?${number}(?!\\d)|(?:^|[ ._-])0?${season}x0?${number}(?!\\d))`,'i');
    const match=videos.find(f=>pattern.test(f.name));
    if(match)return {files:videos,selected:match.index};
    if(videos.length>1)return {files:videos,selected:undefined};
  }
  return {files:videos,selected:[...videos].sort((a,b)=>b.length-a.length)[0]?.index};
}
export function byteRange(header,length) {
  if(!header)return {start:0,end:length-1,partial:false};
  const match=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!match || (!match[1]&&!match[2]))return null;
  const start=match[1] ? Number(match[1]) : Math.max(0,length-Number(match[2]));
  const end=match[1] ? (match[2] ? Math.min(Number(match[2]),length-1) : length-1) : length-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start> end||start>=length)return null;
  return {start,end,partial:true};
}
export function privateIPv4(address) {
  const parts=address.replace(/^::ffff:/,'').split('.').map(Number);
  return parts.length===4&&parts.every(p=>Number.isInteger(p)&&p>=0&&p<=255)&&(parts[0]===10||parts[0]===127||(parts[0]===192&&parts[1]===168)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31));
}
export function localHosts() {return new Set(['localhost','127.0.0.1','[::1]',...Object.values(networkInterfaces()).flat().filter(i=>i?.family==='IPv4'&&privateIPv4(i.address)).map(i=>i.address)]);}
// LAN addresses a Chromecast can reach, used when the engine is listening beyond loopback.
export function lanOrigins(port,interfaces=networkInterfaces()) {
  const suffix=port&&Number(port)!==80?`:${port}`:'';
  return [...new Set(Object.values(interfaces).flat().filter(i=>i?.family==='IPv4'&&!i.internal&&privateIPv4(i.address)&&!i.address.startsWith('127.')).map(i=>`http://${i.address}${suffix}`))];
}
// Exact origins (scheme://host[:port]) of hosted Hasimio UIs allowed to call this engine.
export function parseOrigins(value) {
  const origins=new Set();
  for(const item of String(value ?? '').split(',').map(s=>s.trim()).filter(Boolean)){
    let url;try {url=new URL(item);}catch{throw new Error(`Invalid allowed origin: ${item}`);}
    if(!['http:','https:'].includes(url.protocol)||url.origin!==item.replace(/\/$/,''))throw new Error(`Allowed origins must be scheme://host[:port] only: ${item}`);
    origins.add(url.origin);
  }
  return origins;
}
// Media elements without crossorigin send no Origin header; only session-scoped reads may arrive that way cross-site.
const SESSION_MEDIA=/^\/api\/torrents\/[a-f\d]{36}\/(?:files\/\d+|audio\/(?:main\.m3u8|init\.mp4|segment-\d{6}\.m4s)|subtitles\/\d+\.vtt)$/;
export function localRequest(req,allowedHosts=localHosts(),allowedOrigins=new Set()) {
  const host=req.headers.host ?? '';
  let parsed;try {parsed=new URL(`http://${host}`);}catch{return false;}
  if(!host||parsed.host!==host||!allowedHosts.has(parsed.hostname))return false;
  const remote=req.socket?.remoteAddress;
  if(remote&&remote!=='::1'&&!privateIPv4(remote))return false;
  if(req.headers.origin) {
    if(allowedOrigins.has(req.headers.origin))return true;
    try {const origin=new URL(req.headers.origin);if(!['http:','https:'].includes(origin.protocol)||origin.host!==host)return false;}catch{return false;}
  }
  if(req.headers['sec-fetch-site'] === 'cross-site'){
    if(req.headers.origin||!allowedOrigins.size||!['GET','HEAD'].includes(req.method))return false;
    let pathname;try {pathname=new URL(req.url ?? '/','http://localhost').pathname;}catch{return false;}
    return SESSION_MEDIA.test(pathname);
  }
  return true;
}
export function corsHeaders(req,allowedOrigins) {
  const origin=req.headers.origin;
  if(!origin||!allowedOrigins.has(origin))return {Vary:'Origin'};
  return {'Access-Control-Allow-Origin':origin,'Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges','Vary':'Origin'};
}
export function preflightHeaders(req,allowedOrigins) {
  if(!allowedOrigins.has(req.headers.origin))return undefined;
  const headers={...corsHeaders(req,allowedOrigins),'Access-Control-Allow-Methods':'GET, HEAD, POST, PATCH, DELETE','Access-Control-Allow-Headers':'Content-Type, Range','Access-Control-Max-Age':'600'};
  // Chrome asks before a public site reaches a loopback or LAN address.
  if(req.headers['access-control-request-private-network']==='true')headers['Access-Control-Allow-Private-Network']='true';
  return headers;
}
