import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import {byteRange} from './torrent-utils.mjs';

const MiB=1024*1024;
const AHEAD=6, BEHIND=2;
const SEGMENT=/^segment-(\d{6,})\.m4s$/;
export const HLS_WINDOW=AHEAD+BEHIND;
const DEFAULT_LIMIT=256*MiB;
const METADATA_LIMIT=512*1024;

function *rangeChunks(file,start,end) {
  let offset=0;
  for(const chunk of file.chunks){
    const next=offset+chunk.length;
    if(next>start&&offset<=end)yield chunk.subarray(Math.max(0,start-offset),Math.min(chunk.length,end-offset+1));
    if(next>end)return;
    offset=next;
  }
}

// FFmpeg PUTs one init file, media segments, and a rolling playlist to a private
// loopback port. A full window stops the producer at its next segment. Reading a
// playlist or polling the session never advances the window while the viewer is paused.
export async function createHlsOutput(onReady,onError,{limit=DEFAULT_LIMIT}={}) {
  const prefix='/'+randomBytes(24).toString('hex')+'/';
  const files=new Map(),readers=new Set();
  let bytes=0,delivered=-1,playlist='',nextPlaylist='',closed=false,wake;
  let mediaQueue=Promise.resolve(),playlistQueue=Promise.resolve(),pending=0,exited=false,drainTimer,finish;
  const finished=new Promise(resolve=>{finish=resolve;});
  function notify(){const resolve=wake;wake=undefined;resolve?.();}
  function remove(name,file){files.delete(name);bytes-=file.size;}
  function trim(extra=0) {
    for(const [name,file] of files){
      if(file.index===undefined)continue;
      if(file.readers||file.index>delivered)break;
      // Keep a couple of delivered segments for retries. Under byte pressure one
      // delivered segment plus one in-flight segment must always be able to fit.
      if(file.index<=delivered-BEHIND||(bytes+extra>limit&&file.index<delivered))remove(name,file);
    }
  }
  async function waitFor(test) {
    while(!closed&&!test())await new Promise(resolve=>{wake=resolve;});
    if(closed)throw new Error('Playback ended.');
  }
  function publish(){
    if(!nextPlaylist||!files.has('init.mp4'))return;
    const matches=[...nextPlaylist.matchAll(/^segment-(\d+)\.m4s$/gm)];
    if(!matches.length||!files.has(matches.at(-1)[0]))return;
    playlist=nextPlaylist;nextPlaylist='';
    onReady();
  }
  function checkDrain(){
    clearTimeout(drainTimer);
    if(!exited||closed||pending)return;
    if(playlist.includes('#EXT-X-ENDLIST')){closeWriter();return;}
    // Process exit can arrive before the final HTTP request. A paused PUT stays
    // pending until the viewer consumes a segment, even if FFmpeg already exited.
    drainTimer=setTimeout(()=>{onError(new Error('FFmpeg did not finish the playback playlist.'));closeWriter();},3000);
    drainTimer.unref();
  }
  async function receive(req,res,name,index){
    if(index!==undefined)await waitFor(()=>index<=delivered+AHEAD);
    const chunks=[];
    let size=0;
    for await(const chunk of req){
      size+=chunk.length;
      if(size>(index!==undefined?(limit-METADATA_LIMIT)/2:METADATA_LIMIT))throw new Error('A playback segment exceeds the memory limit. Try another source.');
      if(index!==undefined)await waitFor(()=>{trim(size);return bytes+size<=limit;});
      chunks.push(chunk);
    }
    if(closed)return;
    if(!size)throw new Error('FFmpeg produced empty playback data.');
    if(name==='main.m3u8')nextPlaylist=Buffer.concat(chunks,size).toString('utf8').replaceAll('\r\n','\n');
    else{
      if(files.has(name))throw new Error('FFmpeg repeated a playback segment.');
      files.set(name,{chunks,size,index,readers:0});bytes+=size;
    }
    publish();
    res.writeHead(200,{'Content-Length':0}).end();
  }
  function handle(req,res){
    const name=req.url.startsWith(prefix)?req.url.slice(prefix.length):'';
    const segment=SEGMENT.exec(name);
    if(req.method!=='PUT'||req.headers.origin||(!segment&&name!=='init.mp4'&&name!=='main.m3u8')){
      res.writeHead(404).end();return;
    }
    if(closed||pending>=16){res.writeHead(409).end();return;}
    pending++;
    checkDrain();
    // FFmpeg uses separate persistent connections for media and manifests. A
    // blocked media PUT must allow publication of segments already available.
    const isPlaylist=name==='main.m3u8';
    const previous=isPlaylist?playlistQueue:mediaQueue;
    const work=previous.then(()=>receive(req,res,name,segment?Number(segment[1]):undefined)).catch(error=>{
      if(!closed)onError(error);
      if(!res.headersSent)res.writeHead(500);
      res.end();
    }).finally(()=>{pending--;checkDrain();});
    if(isPlaylist)playlistQueue=work;
    else mediaQueue=work;
  }
  const server=createServer(handle);
  // A producer can wait on the next request for the entire duration of a pause.
  server.requestTimeout=0;
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port+prefix;
  function closeWriter(){
    if(closed)return;
    closed=true;clearTimeout(drainTimer);notify();server.close();server.closeAllConnections();finish();
  }
  function serve(req,res,name,generation){
    if(name==='main.m3u8'){
      // Under byte pressure, a consumed prefix may be gone before the muxer's
      // fixed segment-count window moves. Only advertise segments still in RAM.
      let first;
      const text=playlist.replace(/#EXTINF:[^\n]*\n(segment-\d+\.m4s)\n/g,(entry,segment)=>{
        const file=files.get(segment);
        if(!file)return '';
        first??=file.index;
        return entry;
      }).replace(/(#EXT-X-MEDIA-SEQUENCE:)\d+/,(_,tag)=>tag+(first??0))
        .replace(/(init\.mp4|segment-\d+\.m4s)/g,'$1?job='+generation);
      res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?undefined:text);return;
    }
    const file=files.get(name);
    if(!file){res.writeHead(404,{'Cache-Control':'no-store'}).end();return;}
    const range=byteRange(req.headers.range,file.size);
    if(!range){res.writeHead(416,{'Content-Range':'bytes */'+file.size}).end();return;}
    const headers={'Content-Type':name==='init.mp4'?'video/mp4':'video/iso.segment','Content-Length':range.end-range.start+1,'Cache-Control':'no-store','Accept-Ranges':'bytes'};
    if(range.partial)headers['Content-Range']='bytes '+range.start+'-'+range.end+'/'+file.size;
    res.writeHead(range.partial?206:200,headers);
    if(req.method==='HEAD'){res.end();return;}
    file.readers++;readers.add(res);
    const stream=Readable.from(rangeChunks(file,range.start,range.end),{objectMode:false});
    res.once('close',()=>{
      stream.destroy();
      file.readers--;readers.delete(res);
      if(res.writableFinished&&range.end===file.size-1&&file.index!==undefined)delivered=Math.max(delivered,file.index);
      trim();notify();
    });
    stream.on('error',()=>res.destroy());stream.pipe(res);
  }
  function dispose(){
    closeWriter();
    for(const res of readers)res.destroy();
    readers.clear();files.clear();bytes=0;playlist='';nextPlaylist='';
  }
  function writerExited(){exited=true;checkDrain();}
  return {url,serve,writerExited,finished,dispose};
}
