import http from 'http';
import fs from 'fs';
import path from 'path';
import {pirateBayManifest,searchPirateBay} from '../../server/piratebay.mjs';
import {ytsManifest,searchYts} from '../../server/yts.mjs';
import {eztvManifest,createEztvSearch} from '../../server/eztv.mjs';
import {torrentDownloadsManifest,searchTorrentDownloads} from '../../server/torrentdownloads.mjs';
import {torrentClawManifest,searchTorrentClaw,catalogTorrentClaw,metadataTorrentClaw} from '../../server/torrentclaw.mjs';
import {stremioManifests} from '../../shared/stremio-sources.mjs';
import {searchStremioSource} from '../../server/stremio-sources.mjs';
import {extManifest,searchExt} from '../../server/ext.mjs';
import {createLiveTv} from '../../server/live-tv.mjs';
import {createSkipSegmentLookup} from '../../server/segments.mjs';
import {searchOnlineSubtitles,downloadOnlineSubtitle} from '../../server/online-subtitles.mjs';
import createTorrents from './torrents.cjs';
import createUpdater from './updater.cjs';

const PORT=11476, ORIGIN='http://127.0.0.1:'+PORT;
const MiB=1024*1024, metadataLimit=4*MiB;
const configPath='/media/internal/app.hasimio.tv/settings.json';
let cacheMiB=64;
try {const config=JSON.parse(fs.readFileSync(configPath,'utf8'));if([32,64].includes(config.cacheMiB))cacheMiB=config.cacheMiB;}catch{/* New installation. */}
const torrents=createTorrents({cacheMiB:()=>cacheMiB});
const metadata=new Map(), pending=new Map();
let metadataBytes=0;
const updater=createUpdater({version:HASIMIO_VERSION,stopPlayback:async()=>{await torrents.stop();metadata.clear();metadataBytes=0;}});
const stats=()=>({torrent:torrents.stats(),metadata:{bytes:metadataBytes,limit:metadataLimit},memory:process.memoryUsage(),cacheMiB,storage:'Video pieces stay in RAM; no movie files are written to TV storage.'});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
function cached(key,loader,ttl=5*60*1000){
  const found=metadata.get(key);
  if(found&&found.expires>Date.now()){metadata.delete(key);metadata.set(key,found);return Promise.resolve(JSON.parse(found.text));}
  if(found){metadataBytes-=found.bytes;metadata.delete(key);}
  if(pending.has(key))return pending.get(key);
  if(pending.size>=16)return Promise.reject(Error('The TV is busy. Try again in a moment.'));
  const task=loader().then(value=>{
    const text=JSON.stringify(value),bytes=Buffer.byteLength(text);
    if(bytes<=MiB){
      while(metadataBytes+bytes>metadataLimit&&metadata.size){const oldest=metadata.keys().next().value;metadataBytes-=metadata.get(oldest).bytes;metadata.delete(oldest);}
      metadata.set(key,{text,bytes,expires:Date.now()+ttl});metadataBytes+=bytes;
    }
    return value;
  }).then(value=>{pending.delete(key);return value;},error=>{pending.delete(key);throw error;});
  pending.set(key,task);return task;
}
async function remoteJson(url){const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('The source returned HTTP '+response.status+'.');return response.json();}
function cinemaUrl(resource,type,id,extras){
  if(!['movie','series'].includes(type))throw Error('This catalog supports movies and series.');
  const route='https://v3-cinemeta.strem.io/'+resource+'/'+type+'/'+encodeURIComponent(id);
  return route+(extras?'/'+extras:'')+'.json';
}
async function lookupTitle(id){
  let value;
  try{value=await cached('title:'+id,()=>remoteJson(cinemaUrl('meta','movie',id)));}catch{/* Try series metadata next. */}
  if(!value?.meta)value=await cached('series:'+id,()=>remoteJson(cinemaUrl('meta','series',id)));
  return {...value.meta,start:Number(value.meta.releaseInfo?.slice(0,4))||undefined};
}
const live=createLiveTv();
// Use the byte-bounded outer cache instead of retaining desktop-sized private
// per-show and intro caches in addition to it.
const eztv=(type,id)=>createEztvSearch()(type,id);
const skip=(id,duration)=>cached('segments:'+id+':'+duration,()=>createSkipSegmentLookup({limit:1})(id,duration));
const manifests={piratebay:pirateBayManifest,yts:ytsManifest,eztv:eztvManifest,torrentdownloads:torrentDownloadsManifest,torrentclaw:torrentClawManifest,torrentio:stremioManifests.torrentio,comet:stremioManifests.comet,ext:extManifest};
// Node 8 streams have no async iterator. Read request bodies without buffering
// beyond the small command limit.
function readBody(req){return new Promise((resolve,reject)=>{let text='';req.on('data',part=>{text+=part;if(text.length>32768){reject(Error('Request is too large.'));req.destroy();}});req.once('error',reject);req.once('end',()=>{try{resolve(text?JSON.parse(text):{});}catch(error){reject(error);}});});}
async function route(req,res){
  const host=req.headers.host;
  if(!['127.0.0.1:'+PORT,'localhost:'+PORT].includes(host)||req.headers.origin&&req.headers.origin!==ORIGIN){json(res,403,{error:'Only the Hasimio TV app may use this service.'});return;}
  const url=new URL(req.url,ORIGIN),pathname=url.pathname;
  if(pathname==='/api/streaming/health'){json(res,200,{available:true,apiVersion:1,engineVersion:HASIMIO_VERSION,platform:'webos',nativePlayback:true,cacheLimit:cacheMiB*MiB});return;}
  if(pathname==='/api/webos/updates'){
    if(req.method==='GET'){json(res,200,updater.status());return;}
    if(req.method==='POST'){
      const command=await readBody(req);
      if(command.action==='check'){json(res,200,await updater.check());return;}
      if(command.action==='apply'){json(res,200,await updater.apply());return;}
      if(command.action==='rollback'){json(res,200,await updater.rollback());return;}
      if(command.action==='restart'){await torrents.stop();json(res,200,{restarting:true});setTimeout(()=>process.exit(0),300);return;}
      throw Error('Unknown TV update action.');
    }
    json(res,405,{error:'Method not allowed.'});return;
  }
  if(pathname==='/api/webos/cache'){
    if(req.method==='DELETE'){await torrents.stop();metadata.clear();metadataBytes=0;}
    else if(req.method==='POST'){
      const input=await readBody(req);if(![32,64].includes(input.cacheMiB))throw Error('Choose a 32 MB or 64 MB video cache.');
      await torrents.stop();cacheMiB=input.cacheMiB;
      await new Promise((resolve,reject)=>fs.mkdir(path.dirname(configPath),error=>error&&error.code!=='EEXIST'?reject(error):resolve()));
      await new Promise((resolve,reject)=>fs.writeFile(configPath,JSON.stringify({cacheMiB}),{mode:0o600},error=>error?reject(error):resolve()));
    }else if(req.method!=='GET'){json(res,405,{error:'Method not allowed.'});return;}
    json(res,200,stats());return;
  }
  if(pathname==='/api/webos/stop'&&req.method==='POST'){await torrents.stop();json(res,200,{stopped:true});return;}
  if(pathname==='/api/webos/fetch'&&req.method==='GET'){
    const remote=new URL(url.searchParams.get('url'));
    if(!['http:','https:'].includes(remote.protocol)||remote.username||remote.password||/^(localhost|127\.|0\.|169\.254\.|\[?::1\]?)/i.test(remote.hostname))throw Error('Invalid extension URL.');
    const result=await cached('fetch:'+remote.href,async()=>{
      const response=await fetch(remote.href,{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('The source returned HTTP '+response.status+'.');
      const type=response.headers.get('content-type')||'text/plain';
      return {type,text:await response.text()};
    },60000);
    res.writeHead(200,{'Content-Type':result.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(result.text);return;
  }
  if(pathname==='/api/cast'){json(res,200,{available:false});return;}
  if(pathname==='/api/torrent-inspections'){json(res,409,{error:'Tracks are read by the TV after playback starts.'});return;}
  if(pathname==='/api/torrents'&&req.method==='POST'){json(res,200,await torrents.start(await readBody(req)));return;}
  const torrentRoute=/^\/api\/torrents\/([a-f\d]{36})(?:\/files\/(\d+)|\/(audio-tracks|audio|subtitles(?:\/\d+)?))?$/.exec(pathname);
  if(torrentRoute){
    const session=torrents.get(torrentRoute[1]);
    if(torrentRoute[2]!=null&&['GET','HEAD'].includes(req.method)){torrents.serve(session,Number(torrentRoute[2]),req,res);return;}
    if(torrentRoute[3]){
      if(req.method==='POST'){json(res,409,{error:'The TV uses native audio and subtitle tracks. Choose a compatible source if its codec is unsupported.'});return;}
      json(res,200,torrents.snapshot(session));return;
    }
    if(req.method==='DELETE'){await torrents.stop();json(res,200,{stopped:true});return;}
    if(req.method==='PATCH'){json(res,200,torrents.choose(session,(await readBody(req)).fileIndex));return;}
    if(req.method==='GET'){json(res,200,torrents.snapshot(session));return;}
  }
  const extension=/^\/api\/extensions\/([a-z]+)\/(manifest\.json|(?:(stream|catalog|meta)\/([^/]+)\/([^/]+)(?:\/([^/]+))?\.json))$/.exec(pathname);
  if(extension&&req.method==='GET'){
    const [,key,file,resource,rawType,rawId,extras]=extension,type=decodeURIComponent(rawType||''),id=decodeURIComponent(rawId||'');
    if(key==='titles'){
      if(file==='manifest.json'){json(res,200,{id:'org.hasimio.titles',name:'TV catalogs',version:'1.0.0',description:'Online movie and series metadata; no IMDb database is downloaded to the TV.',resources:['catalog','meta'],types:['movie','series'],catalogs:[]});return;}
      const mapped=resource==='catalog'?(id==='popular'?'top':id==='top-rated'?'imdbRating':id):id;
      const result=await cached(pathname,()=>remoteJson(cinemaUrl(resource,type,mapped,extras)));
      // Keep DOM and decoded artwork bounded; paging stays explicit on TV.
      if(result.metas)result.metas=result.metas.slice(0,30);
      json(res,200,result);return;
    }
    if(file==='manifest.json'&&manifests[key]){json(res,200,manifests[key]);return;}
    const sources={piratebay:()=>searchPirateBay(type,id,fetch,lookupTitle),yts:()=>searchYts(type,id),eztv:()=>eztv(type,id),torrentdownloads:()=>searchTorrentDownloads(type,id,fetch,lookupTitle),torrentclaw:()=>resource==='catalog'?catalogTorrentClaw(type,id,Object.fromEntries(new URLSearchParams(extras||''))):resource==='meta'?metadataTorrentClaw(type,id):searchTorrentClaw(type,id),torrentio:()=>searchStremioSource('torrentio',type,id),comet:()=>searchStremioSource('comet',type,id),ext:()=>searchExt(type,id,fetch,lookupTitle)};
    if(sources[key]){json(res,200,await cached(pathname,sources[key]));return;}
  }
  const channel=/^\/api\/live-tv\/([a-z0-9-]+)\/(main|alternative)\/(index\.m3u8|asset\/[a-f\d]{32})$/.exec(pathname);
  if(channel&&req.method==='GET'){
    const controller=new AbortController();res.once('close',()=>controller.abort());
    const output=await live.resource(channel[1],channel[2],channel[3].replace('asset/',''),controller.signal);
    res.writeHead(200,{'Content-Type':output.type,'Cache-Control':'no-store'});res.end(output.body);return;
  }
  if(pathname==='/api/segments'){json(res,200,await skip(url.searchParams.get('videoId'),Number(url.searchParams.get('durationMs'))));return;}
  if(pathname==='/api/subtitles/search'){json(res,200,await searchOnlineSubtitles(url.searchParams.get('id'),url.searchParams.get('filename')||''));return;}
  const subtitle=/^\/api\/subtitles\/files\/(\d+)$/.exec(pathname);
  if(subtitle){const text=await downloadOnlineSubtitle(subtitle[1]);res.writeHead(200,{'Content-Type':'text/vtt; charset=utf-8','Cache-Control':'no-store'});res.end(text);return;}
  // People requires the desktop IMDb people database; don't build one on TV.
  if(pathname==='/api/people/photos'){json(res,200,{photos:{}});return;}
  if(pathname.startsWith('/api/people')){json(res,200,{people:[],metas:[]});return;}
  if(pathname.startsWith('/api/')){json(res,404,{error:'This feature is unavailable in the TV edition.'});return;}
  if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Method not allowed.'});return;}
  const root=path.join(__dirname,'www');
  const relative=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/, '');
  const filename=path.resolve(root,relative);
  if(!filename.startsWith(root+path.sep)){json(res,403,{error:'Invalid path.'});return;}
  fs.stat(filename,(error,stat)=>{
    if(error||!stat.isFile()){json(res,404,{error:'File not found.'});return;}
    const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':pathname.startsWith('/assets/')?'public, max-age=3600':'no-store','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else{const stream=fs.createReadStream(filename);stream.on('error',()=>res.destroy());res.once('close',()=>stream.destroy());stream.pipe(res);}
  });
}
const server=http.createServer((req,res)=>{route(req,res).catch(error=>{if(res.headersSent)res.destroy();else json(res,400,{error:error.message||'The TV service could not complete this request.'});});});
server.setTimeout(60000);
server.on('error',error=>console.error('Hasimio TV service:',error.code));
server.listen(PORT,'127.0.0.1',()=>{if(global.HASIMIO_TV_READY)global.HASIMIO_TV_READY();});
const Service=global.HASIMIO_TV_SERVICE;
const service=new Service('app.hasimio.tv.service');
service.register('start',message=>message.respond({returnValue:true,url:ORIGIN,subscribed:Boolean(message.isSubscription)}),()=>{void torrents.stop();});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void torrents.close().then(()=>{server.close();process.exit(0);});});
