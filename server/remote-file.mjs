import {Readable} from 'node:stream';
import {isIP} from 'node:net';
import path from 'node:path';
import {stremioSources} from '../shared/stremio-sources.mjs';
import {DEBRID_PROVIDERS} from './stremio-sources.mjs';
import {VIDEO_EXTENSIONS} from './torrent-utils.mjs';

// Debrid links play through the engine the way a torrent file does, so FFmpeg
// can give them compatible audio and subtitles (most debrid files are MKV with
// DD+, AC3 or DTS sound, which the desktop player cannot decode). The engine
// fetches only Torrentio's own /resolve/ links, follows their redirect to the
// debrid service once, and then reads that file in byte ranges. FFmpeg still
// reads over the engine's loopback route, so its input guard stays as it is
// and the link, which carries the debrid key, never reaches its arguments.

const REDIRECTS=5,READ_RETRIES=3;
const redirects=new Set([301,302,303,307,308]);

export function torrentioOrigin(){
  return new URL(process.env.HASIMIO_TORRENTIO_MANIFEST_URL||stremioSources.torrentio.manifestUrl).origin;
}
/** A Torrentio resolve link for a known debrid service, or undefined for anything else. */
export function debridLink(value){
  let url;try{url=new URL(String(value));}catch{return undefined;}
  if(url.origin!==torrentioOrigin()||url.username||url.password)return undefined;
  const match=/\/resolve\/([a-z]+)\//.exec(url.pathname);
  return match&&DEBRID_PROVIDERS.includes(match[1])?url:undefined;
}
/** Loopback, private and link-local literals: a redirect must not point the engine at this PC or its network. */
export function privateHost(hostname){
  const host=hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost'))return true;
  const version=isIP(host);
  if(version===4){
    const [a,b]=host.split('.').map(Number);
    return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
  }
  if(version===6)return host==='::'||host==='::1'||host.startsWith('::ffff:')||/^f[cd]/.test(host)||/^fe[89ab]/.test(host);
  return false;
}
function fileName(...candidates){
  for(const candidate of candidates){
    if(typeof candidate!=='string')continue;
    let name=candidate;try{name=decodeURIComponent(candidate);}catch{/* Keep it as sent. */}
    name=path.basename(name.replaceAll('\\','/')).trim();
    if(name&&name.length<=255&&VIDEO_EXTENSIONS.test(name))return name;
  }
  return undefined;
}
const lastSegment=url=>url.pathname.split('/').filter(Boolean).pop();
// Torrentio ships short clips that explain a failure (static/videos, such as
// downloading_v3.mp4). Played as a source they would look like a film that
// ends at once; reported as an error, the next source is tried instead.
const notices=[
  [/^downloading_/,'The debrid service is still downloading this file. Choose a source marked with a plus, such as [RD+], to play now.'],
  [/^(?:failed|blocked)_access_/,'Your debrid account refused this request. Check the API key in Settings.'],
  [/^limits_exceeded_/,'Your debrid account has reached its limit. Try again later or choose another source.'],
  [/^failed_rar_/,'This debrid file is an archive, not a video. Choose another source.'],
  [/^(?:download_failed|failed_[a-z_]+)_/,'The debrid service could not provide this file. Choose another source.'],
];
export function torrentioNotice(url){
  const name=/\/videos\/([a-z_]+_v\d+\.mp4)$/.exec(url.pathname)?.[1];
  return name?notices.find(([pattern])=>pattern.test(name))?.[1]:undefined;
}

/**
 * Asks for a byte range, following redirects by hand so each hop can be
 * checked. Errors never include the address: it holds the debrid key.
 */
async function request(start,range,fetchImpl,signal){
  let url=start;
  for(let hop=0;;hop++){
    let response;
    try{response=await fetchImpl(url,{headers:{Range:range},redirect:'manual',signal});}
    catch(error){if(signal?.aborted)throw error;throw new Error('The debrid service could not be reached.');}
    if(!redirects.has(response.status))return {response,url};
    await response.body?.cancel().catch(()=>{});
    const location=response.headers.get('location');
    if(!location||hop>=REDIRECTS)throw new Error('The debrid link did not lead to a file.');
    url=new URL(location,url);
    if(url.protocol!=='https:'||url.username||url.password||privateHost(url.hostname))throw new Error('The debrid service sent the file somewhere Hasimio will not fetch from.');
  }
}

/**
 * Opens a debrid link as a file the streaming routes can read like a torrent
 * file: a name, a length and ranged read streams.
 */
export async function openRemoteFile(link,{name,fetchImpl=fetch,signal}={}){
  // Resolve once: each visit to a Torrentio resolve link asks the debrid service for a fresh download link.
  const {response,url:target}=await request(link,'bytes=0-0',fetchImpl,signal);
  await response.body?.cancel().catch(()=>{});
  const notice=torrentioNotice(target);if(notice)throw new Error(notice);
  const total=Number(/^bytes 0-0\/(\d+)$/.exec(response.headers.get('content-range')??'')?.[1]);
  if(response.status!==206||!Number.isSafeInteger(total)||total<=0)throw new Error(response.ok
    ?'The debrid service does not allow seeking in this file, so Hasimio cannot play it. Choose another source.'
    :`The debrid service did not hand over this file (HTTP ${response.status}). Check your debrid account in Settings, or choose another source.`);
  const filename=fileName(name,lastSegment(target),lastSegment(link));
  if(!filename)throw new Error('This debrid link is not a video file. Choose another source.');
  return {name:filename,path:filename,length:total,select(){},deselect(){},
    createReadStream({start=0,end=total-1}={}){
      const controller=new AbortController();
      async function* read(){
        let offset=start,failures=0;
        while(offset<=end){
          try{
            const {response:part}=await request(target,`bytes=${offset}-${end}`,fetchImpl,controller.signal);
            const from=Number(/^bytes (\d+)-/.exec(part.headers.get('content-range')??'')?.[1]);
            if(part.status!==206||from!==offset){await part.body?.cancel().catch(()=>{});throw new Error('Unexpected range.');}
            for await(const chunk of part.body){
              const bytes=Buffer.from(chunk).subarray(0,end-offset+1);
              offset+=bytes.length;failures=0;
              yield bytes;
              if(offset>end)break;
            }
            if(offset<=end)throw new Error('Closed early.');
          }catch(error){
            if(controller.signal.aborted)return;
            // A long, throttled read can lose its connection; carry on from where it stopped.
            if(++failures>READ_RETRIES)throw new Error('The debrid service stopped sending this file. Try again or choose another source.',{cause:error});
            await new Promise(resolve=>setTimeout(resolve,400*failures));
          }
        }
      }
      const stream=Readable.from(read(),{objectMode:false});
      // A generator waiting on the network only ends once that wait does, so
      // abort the request first: destroying a stalled read must free it at once.
      const destroy=stream._destroy;
      stream._destroy=(error,callback)=>{controller.abort();destroy.call(stream,error,callback);};
      return stream;
    }};
}

/** The torrent-shaped session holder for a remote file: no peers, nothing to select. */
export function remoteTorrent(file){
  const torrent={files:[file],numPeers:0,downloadSpeed:0,downloaded:0,received:0,progress:0,destroyed:false,
    destroy(_options,callback){torrent.destroyed=true;callback?.();}};
  return torrent;
}
