import {randomBytes} from 'node:crypto';
import {mkdir,stat,readFile,rm} from 'node:fs/promises';
import {createReadStream,readFileSync} from 'node:fs';
import path from 'node:path';
import {pirateBayManifest,searchPirateBay,validHash} from './piratebay.mjs';
import {createTitleIndex,titleIndexManifest} from './title-index.mjs';
import {byteRange,corsHeaders,localRequest,parseOrigins,preflightHeaders,selectVideo,VIDEO_EXTENSIONS,CONTAINER_HEADER,videoContainer} from './torrent-utils.mjs';
import {cacheDir} from './paths.mjs';
import {ENGINE_API_VERSION} from '../shared/engine-api.mjs';

const engineVersion=(()=>{try {return JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;}catch {return 'unknown';}})();
import {createAudioJob,stopAudioJob,audioStatus,probeAudioTracks,audioRoot} from './compatible-audio.mjs';

import {createSubtitleJob,subtitleStatus} from './subtitles.mjs';
import {createInspectionScheduler} from './inspection-scheduler.mjs';
import {inspectionStream} from './inspection-stream.mjs';

const cacheRoot=cacheDir('torrents');
const trackers=['udp://tracker.opentrackr.org:1337/announce','udp://open.stealth.si:80/announce','udp://tracker.torrent.eu.org:451/announce'];
// Bytes per second sent back to peers. A little keeps them trading pieces with us; every uploaded byte is sharing.
export const UPLOAD_LIMIT=64*1024;
// A crash skips stop(), so the first torrent of each run clears what an earlier run left behind.
let swept;
const sweepCache=()=>swept??=Promise.all([cacheRoot,audioRoot].map(dir=>rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{})));
export function createMediaService({clientFactory,inspectionClientFactory,allowedOrigins=parseOrigins(process.env.HASIMIO_ALLOWED_ORIGINS),titles=createTitleIndex({dir:cacheDir('titles')})}={}) {
  let clientPromise;let inspectionClientPromise;const scheduleInspection=createInspectionScheduler();let shuttingDown=false;const inspectionCache=new Map();
  const sessions=new Map();const searches=new Map();
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  async function client(inspection=false) {
    let promise=inspection?inspectionClientPromise:clientPromise;
    if(!promise){promise=(async()=>{await sweepCache();await mkdir(cacheRoot,{recursive:true});const {default:WebTorrent}=await import('webtorrent');const factory=inspection?inspectionClientFactory:clientFactory;const instance=factory?factory():new WebTorrent({natUpnp:false,natPmp:false,lsd:false,utp:false,maxConns:inspection?12:40,uploadLimit:UPLOAD_LIMIT});instance.on('error',error=>{for(const session of sessions.values())if(session.inspection===inspection)session.error=error.message;if(inspection)inspectionClientPromise=undefined;else clientPromise=undefined;});return instance;})().catch(error=>{if(inspection)inspectionClientPromise=undefined;else clientPromise=undefined;throw error;});if(inspection)inspectionClientPromise=promise;else clientPromise=promise;}
    return promise;
  }
  async function clearAudio(session){if(session.audioPending){try{await session.audioPending;}catch{/* Failed startup still needs any completed job cleaned. */}}await stopAudioJob(session.audioJob);session.audioJob=undefined;}
  async function clearSubtitles(session){if(session.subtitleQueue)await session.subtitleQueue.catch(()=>{});await stopAudioJob(session.subtitleJob);session.subtitleJob=undefined;}
  async function stop(id) {const session=sessions.get(id);if(!session)return; sessions.delete(id);clearTimeout(session.timer);session.probeController?.abort();if(session.audioQueue)await session.audioQueue.catch(()=>{});await clearAudio(session);await clearSubtitles(session);for(const stream of session.readers)stream.destroy();if(session.torrent&&!session.torrent.destroyed)await new Promise(resolve=>session.torrent.destroy({destroyStore:true},resolve));}
  function snapshot(session) {session.touched=Date.now();return {id:session.id,state:session.error?'error':session.ready?'ready':'buffering',error:session.error,files:session.files,selected:session.selected,duration:session.duration,audio:audioStatus(session.audioJob,session.id),audioTracks:session.audioTracks,subtitleTracks:session.subtitleTracks,subtitle:subtitleStatus(session.subtitleJob,session.id),numPeers:session.torrent?.numPeers ?? 0,downloadSpeed:session.torrent?.downloadSpeed ?? 0,downloaded:session.torrent?.downloaded ?? 0,progress:session.torrent?.progress ?? 0,mediaUrl:session.ready&&session.selected!=null?`/api/torrents/${session.id}/files/${session.selected}`:undefined};}
  async function start(input,inspection=false) {
    if(!validHash(input.infoHash))throw new Error('A valid torrent info hash is required.');
    const hash=input.infoHash.toLowerCase();
    const engine=await client(inspection);
    if(!inspection)for(const [id,active] of [...sessions.entries()])if(!active.inspection)await stop(id);
    if(shuttingDown)throw new Error('Streaming service is stopping.');
    const id=randomBytes(18).toString('hex');
    const session={id,inspection,touched:Date.now(),ready:false,files:[],selected:undefined,readers:new Set()};sessions.set(id,session);
    const magnet=`magnet:?xt=urn:btih:${hash}`;
    const torrent=engine.add(magnet,{path:path.join(cacheRoot,inspection?'inspections':'playback',hash),addUID:true,destroyStoreOnDestroy:true,deselect:true,strategy:'sequential',announce:trackers});session.torrent=torrent;
    session.timer=setTimeout(()=>{session.error='No torrent metadata arrived within 90 seconds. Try a source with more seeders.';if(!torrent.destroyed)torrent.destroy({destroyStore:true},()=>{});},90000);session.timer.unref();
    torrent.on('error',error=>{clearTimeout(session.timer);session.error=error.message;});
    torrent.once('ready',()=>{clearTimeout(session.timer);const selection=selectVideo(torrent.files,input.videoId);session.files=selection.files;session.selected=selection.selected;if(!session.files.length){session.error='This torrent contains no supported video files.';return;}session.ready=true;for(const file of torrent.files)file.deselect();if(!inspection&&session.selected!=null)torrent.files[session.selected].select();});
    return snapshot(session);
  }
  // Every read of a file, FFmpeg's included, waits for its first bytes to prove it is a video container.
  function checkContainer(session,index){
    session.checks??=new Map();
    if(!session.checks.has(index))session.checks.set(index,(async()=>{
      const file=session.torrent.files[index];const stream=file.createReadStream({start:0,end:Math.min(file.length,CONTAINER_HEADER)-1});session.readers.add(stream);
      const waiting=setTimeout(()=>stream.destroy(new Error('Peers connected, but no video data arrived. Try a source with more active seeders.')),45000);waiting.unref();
      const chunks=[];
      try{for await(const chunk of stream)chunks.push(chunk);}
      catch(error){session.checks.delete(index);throw error;}
      finally{clearTimeout(waiting);session.readers.delete(stream);}
      if(!videoContainer(Buffer.concat(chunks))){session.error='This file is not a real video, so Hasimio will not open it. Choose another source.';throw new Error(session.error);}
    })());
    return session.checks.get(index);
  }
  async function inspect(input,port,controller){
    if(!validHash(input.infoHash))throw new Error('A valid torrent info hash is required.');
    const key=input.infoHash.toLowerCase()+':'+(input.videoId||'');
    if(controller.signal.aborted)throw new Error('Track check cancelled.');
    if(inspectionCache.has(key))return inspectionCache.get(key);
    const initial=await start(input,true);const session=sessions.get(initial.id);
    try{
      while(!session.ready&&!session.error){if(controller.signal.aborted||!sessions.has(session.id))throw new Error('Track check cancelled.');await new Promise(resolve=>setTimeout(resolve,100));}
      if(session.error)throw new Error(session.error);
      if(session.selected==null)throw new Error('This pack needs an episode selection. Choose a specific episode before checking tracks.');
      if(controller.signal.aborted)throw new Error('Track check cancelled.');
      session.probeController=controller;
      const tracks=await probeAudioTracks('http://127.0.0.1:'+port+'/api/torrents/'+session.id+'/files/'+session.selected,controller.signal,{fast:/\.(mp4|m4v|mkv|mov|webm)$/i.test(session.torrent.files[session.selected].name)});
      const result={...tracks,fileIndex:session.selected,filename:session.torrent.files[session.selected].name};
      if(inspectionCache.size>=100)inspectionCache.delete(inspectionCache.keys().next().value);
      inspectionCache.set(key,result);return result;
    }finally{await stop(session.id);}
  }
  const cleanup=setInterval(()=>{for(const session of sessions.values())if(Date.now()-session.touched>3*60*1000)stop(session.id).catch(()=>{});for(const [key,item] of searches)if(item.expires<Date.now())searches.delete(key);},60000);cleanup.unref();
  async function body(req) {let text='';for await(const chunk of req){text+=chunk;if(text.length>2048)throw new Error('Request is too large.');}return JSON.parse(text);}
  async function handle(req,res,next=()=>{res.writeHead(404);res.end();}) {
    const url=new URL(req.url ?? '/','http://localhost');if(!url.pathname.startsWith('/api/'))return next();
    if(req.method==='OPTIONS'){const headers=localRequest(req,undefined,allowedOrigins)&&preflightHeaders(req,allowedOrigins);res.writeHead(headers?204:403,headers||{});return res.end();}
    if(!localRequest(req,undefined,allowedOrigins))return json(res,403,{error:'Streaming requests must come from this app on localhost, this PC’s private LAN address, or an allowed Hasimio site.'});
    for(const [name,value] of Object.entries(corsHeaders(req,allowedOrigins)))res.setHeader(name,value);
    try {
      if(req.method==='GET'&&url.pathname==='/api/streaming/health')return json(res,200,{available:true,apiVersion:ENGINE_API_VERSION,engineVersion,provider:'The Pirate Bay',engine:'WebTorrent',audioCompatibility:'aac-stereo-hls',active:sessions.size});
      if(req.method==='GET'&&url.pathname==='/api/extensions/piratebay/manifest.json')return json(res,200,pirateBayManifest);
      const source=/^\/api\/extensions\/piratebay\/stream\/(movie|series|anime)\/([^/]+)\.json$/.exec(url.pathname);
      if(req.method==='GET'&&source){const type=source[1],id=decodeURIComponent(source[2]),key=`${type}:${id}`;let item=searches.get(key);if(!item||item.expires<Date.now()){item={expires:Date.now()+5*60*1000,promise:searchPirateBay(type,id,undefined,titles.title)};searches.set(key,item);item.promise.catch(()=>searches.delete(key));}try{return json(res,200,await item.promise);}catch(error){return json(res,502,{error:error.message});}}
      if(req.method==='GET'&&url.pathname==='/api/extensions/titles/manifest.json')return json(res,200,titleIndexManifest);
      const titleRoute=/^\/api\/extensions\/titles\/(catalog|meta)\/(movie|series)\/([^/]+)(?:\/([^/]+))?\.json$/.exec(url.pathname);
      if(req.method==='GET'&&titleRoute){const [,resource,type,id,extras]=titleRoute;try{return json(res,200,resource==='catalog'?await titles.catalog(type,decodeURIComponent(id),Object.fromEntries(new URLSearchParams(extras??''))):await titles.meta(type,decodeURIComponent(id)));}catch(error){return json(res,error.status??502,{error:error.message});}}
      if(req.method==='POST'&&url.pathname==='/api/torrent-inspections'){
        if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Send JSON.'});
        const input=await body(req);if(!validHash(input.infoHash))return json(res,400,{error:'A valid torrent info hash is required.'});
        const controller=new AbortController();const cancel=()=>controller.abort();res.once('close',cancel);
        try{const operation=scheduleInspection(input.infoHash.toLowerCase(),()=>inspect(input,req.socket.localPort,controller),controller.signal);const result=await operation;if(!res.destroyed)return json(res,200,result);}finally{res.removeListener('close',cancel);}
        return;
      }
      if(req.method==='POST'&&url.pathname==='/api/torrents'){if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Send JSON.'});return json(res,202,await start(await body(req)));}
      const tracksRoute=/^\/api\/torrents\/([a-f\d]{36})\/audio-tracks$/.exec(url.pathname);
      if(tracksRoute&&req.method==='GET'){
        const session=sessions.get(tracksRoute[1]);if(!session)return json(res,404,{error:'This streaming session has ended.'});
        if(!session.ready||session.selected==null)return json(res,409,{error:'Choose a ready video file first.'});
        session.touched=Date.now();const index=session.selected;
        if(!session.audioTracks&&!session.probePending){
          const controller=new AbortController();session.probeController=controller;
          session.probePending=probeAudioTracks('http://127.0.0.1:'+req.socket.localPort+'/api/torrents/'+session.id+'/files/'+index,controller.signal).then(tracks=>{if(session.selected===index&&!controller.signal.aborted){session.duration=tracks.duration;session.audioTracks=tracks.audioTracks;session.subtitleTracks=tracks.subtitleTracks;}}).finally(()=>{if(session.probeController===controller){session.probePending=undefined;session.probeController=undefined;}});
        }
        if(session.probePending)await session.probePending;
        if(!sessions.has(session.id)||session.selected!==index)return json(res,409,{error:'The video file changed. Reload audio languages.'});
        return json(res,200,snapshot(session));
      }
      const subtitleRoute=/^\/api\/torrents\/([a-f\d]{36})\/subtitles\/(\d+)(\.vtt)?$/.exec(url.pathname);
      if(subtitleRoute){
        const session=sessions.get(subtitleRoute[1]);if(!session)return json(res,404,{error:'This streaming session has ended.'});session.touched=Date.now();
        const track=Number(subtitleRoute[2]);const selected=session.selected;
        if(req.method==='POST'&&!subtitleRoute[3]){
          if(selected==null||!session.subtitleTracks?.some(item=>item.index===track&&item.supported))return json(res,400,{error:'Choose an available text subtitle track. Image subtitles need a different source or a separate SRT / VTT file.'});
          const mutate=async()=>{if(!sessions.has(session.id)||session.selected!==selected)throw new Error('The video file changed. Choose subtitles again.');if(session.subtitleJob?.track!==track||session.subtitleJob?.state==='error'){await stopAudioJob(session.subtitleJob);session.subtitleJob=undefined;}if(!session.subtitleJob)session.subtitleJob=await createSubtitleJob(session.id,selected,track,'http://127.0.0.1:'+req.socket.localPort+'/api/torrents/'+session.id+'/files/'+selected);};
          const operation=(session.subtitleQueue??Promise.resolve()).catch(()=>{}).then(mutate);session.subtitleQueue=operation;await operation;return json(res,202,snapshot(session));
        }
        if(req.method==='GET'&&subtitleRoute[3]){
          const job=session.subtitleJob;if(!job||job.track!==track||String(job.fileIndex)!==url.searchParams.get('file'))return json(res,404,{error:'This subtitle track is no longer selected.'});
          if(job.state==='error')return json(res,409,{error:job.error});
          let text;try{text=await readFile(path.join(job.folder,'captions.vtt'),'utf8');}catch{res.writeHead(204,{'Cache-Control':'no-store'});return res.end();}
          if(job.closed)text=text.trimEnd()+'\n\n';
          res.writeHead(200,{'Content-Type':'text/vtt; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(text);
        }
        if(req.method==='DELETE'&&!subtitleRoute[3]){await clearSubtitles(session);return json(res,200,snapshot(session));}
      }
      const audioRoute=/^\/api\/torrents\/([a-f\d]{36})\/audio(?:\/(main\.m3u8|init\.mp4|segment-\d{6}\.m4s))?$/.exec(url.pathname);
      if(audioRoute){const session=sessions.get(audioRoute[1]);if(!session)return json(res,404,{error:'This streaming session has ended.'});session.touched=Date.now();
        if(['GET','HEAD'].includes(req.method)&&audioRoute[2]){
          const job=session.audioJob;
          if(url.searchParams.has('job')&&url.searchParams.get('job')!==job?.generation)return json(res,409,{error:'The playback position changed.'});
          if(audioRoute[2]==='main.m3u8'&&job?.state==='ready'){
            const playlist=(await readFile(path.join(job.folder,'main.m3u8'),'utf8')).replace(/(init\.mp4|segment-\d{6}\.m4s)/g,`$1?job=${job.generation}`);
            res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:playlist);
          }
        }
        if(['POST','DELETE'].includes(req.method)&&!audioRoute[2]){
          const input=req.method==='POST'&&req.headers['content-type']?.startsWith('application/json')?await body(req):{};
          const mutate=async()=>{
            if(!sessions.has(session.id))throw new Error('This streaming session has ended.');
            if(req.method==='DELETE'){await clearAudio(session);return;}
            if(!session.ready||session.selected==null)throw new Error('Choose a ready video file first.');
            const track=input.track??0;
            const start=input.start??0;
            if(!Number.isFinite(start)||start<0||(session.duration && start>=session.duration))throw new Error('Choose a time within the video.');
            if(!Number.isInteger(track)||track<0||(track!==0&&!session.audioTracks?.some(item=>item.index===track)))throw new Error('Choose an available audio track.');
            if(session.audioJob?.track!==track||session.audioJob?.start!==start)await clearAudio(session);
            if(!session.audioJob){const index=session.selected;const mediaInput='http://127.0.0.1:'+req.socket.localPort+'/api/torrents/'+session.id+'/files/'+index;session.audioPending=createAudioJob(session.id,index,mediaInput,session.torrent.files[index].name,track,start).then(job=>{session.audioJob=job;}).finally(()=>{session.audioPending=undefined;});await session.audioPending;}
          };
          const operation=(session.audioQueue??Promise.resolve()).catch(()=>{}).then(mutate);session.audioQueue=operation;await operation;
          return json(res,req.method==='POST'?202:200,snapshot(session));
        }
        if(['GET','HEAD'].includes(req.method)&&audioRoute[2]){const job=session.audioJob;if(!job||job.state!=='ready')return json(res,409,{error:job?.error||'Compatible audio is still buffering.'});const file=path.join(job.folder,audioRoute[2]);let size;try{size=(await stat(file)).size;}catch{return json(res,404,{error:'Audio segment is not ready.'});}const range=byteRange(req.headers.range,size);if(!range){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}const type=audioRoute[2].endsWith('.m3u8')?'application/vnd.apple.mpegurl':audioRoute[2].endsWith('.mp4')?'video/mp4':'video/iso.segment';const headers={'Content-Type':type,'Content-Length':range.end-range.start+1,'Cache-Control':'no-store','Accept-Ranges':'bytes'};if(range.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${size}`;res.writeHead(range.partial?206:200,headers);if(req.method==='HEAD')return res.end();const stream=createReadStream(file,{start:range.start,end:range.end});stream.on('error',()=>res.destroy());res.once('close',()=>stream.destroy());stream.pipe(res);return;}
      }
      const sessionRoute=/^\/api\/torrents\/([a-f\d]{36})(?:\/files\/(\d+))?$/.exec(url.pathname);
      if(sessionRoute){const session=sessions.get(sessionRoute[1]);if(!session)return json(res,404,{error:'This streaming session has ended.'});
        if(req.method==='DELETE'){await stop(session.id);return json(res,200,{stopped:true});}
        if(req.method==='GET'&&!sessionRoute[2])return json(res,200,snapshot(session));
        if(req.method==='PATCH'&&!sessionRoute[2]){const input=await body(req);const file=session.files.find(f=>f.index===input.fileIndex);if(!file)return json(res,400,{error:'Choose a video file from this torrent.'});session.probeController?.abort();session.probePending=undefined;session.duration=undefined;session.audioTracks=undefined;session.subtitleTracks=undefined;await clearSubtitles(session);if(session.audioQueue)await session.audioQueue.catch(()=>{});await clearAudio(session);for(const f of session.torrent.files)f.deselect();session.selected=file.index;session.torrent.files[file.index].select();return json(res,200,snapshot(session));}
        if(['GET','HEAD'].includes(req.method)&&sessionRoute[2]){const index=Number(sessionRoute[2]),file=session.torrent?.files[index];if(!session.ready||!file||!VIDEO_EXTENSIONS.test(file.name))return json(res,404,{error:'Video file is not ready.'});session.touched=Date.now();
          try{await checkContainer(session,index);}catch(error){return json(res,415,{error:error.message});}
          const range=byteRange(req.headers.range,file.length);if(!range){res.writeHead(416,{'Content-Range':`bytes */${file.length}`});return res.end();}
          const ext=path.extname(file.name).toLowerCase();const mime={'.mp4':'video/mp4','.m4v':'video/mp4','.webm':'video/webm','.mkv':'video/x-matroska','.mov':'video/quicktime','.avi':'video/x-msvideo'}[ext];
          const headers={'Content-Type':mime,'Content-Length':range.end-range.start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(range.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${file.length}`;
          if(url.searchParams.get('download')==='1')headers['Content-Disposition']="attachment; filename*=UTF-8''"+encodeURIComponent(path.basename(file.name)).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
          res.writeHead(range.partial?206:200,headers);if(req.method==='HEAD')return res.end();const stream=session.inspection?inspectionStream(file,range):file.createReadStream({start:range.start,end:range.end});session.readers.add(stream);const waiting=setTimeout(()=>{session.error='Peers connected, but no video data arrived. Try a source with more active seeders.';stream.destroy(new Error(session.error));},45000);waiting.unref();stream.once('data',()=>clearTimeout(waiting));stream.on('error',()=>{clearTimeout(waiting);res.destroy();});res.once('close',()=>{clearTimeout(waiting);session.readers.delete(stream);stream.destroy();});stream.pipe(res);return;
        }
      }
      return json(res,404,{error:'Unknown local streaming endpoint.'});
    }catch(error){if(!res.headersSent)json(res,400,{error:error.message || 'The local streaming service could not complete this request.'});else res.destroy();}
  }
  async function close() {shuttingDown=true;clearInterval(cleanup);await titles.close();for(const id of [...sessions.keys()])await stop(id);for(const pending of [clientPromise,inspectionClientPromise])if(pending){const instance=await pending;if(!instance.destroyed)await new Promise(resolve=>instance.destroy(resolve));}}
  return {handle,close};
}
