// The TV interface on the PC: webos.html (the TV entry, with remote navigation, Back handling and tv.css)
// served by the normal dev server with VITE_WEBOS switched on. View it at 1280x720, the TV's UI surface,
// and use the arrow keys, Enter, and Escape for the remote's Back button.
//
// The dev server runs the PC's Hasimio Engine in-process. The engine clears its torrent cache on start, so
// it gets its own folder here, never the installed app's (%LOCALAPPDATA%\Hasimio\cache). The folder
// persists, so the title index is built once.
//
// The TV service's own routes (webos/service/server.mjs) are stood in for below. /api/webos/fetch really
// fetches, with the same URL checks, because the TV app sends every outside request through it.
// Updates, memory figures and the video buffer are placeholders: check those on the TV itself.
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';

process.env.VITE_WEBOS='true';
process.env.HASIMIO_CACHE_DIR||=path.resolve('.cache/tv-dev/cache');
const port=Number(process.env.PORT)||5178;
const version=JSON.parse(readFileSync('package.json','utf8')).version;
let cacheMiB=64;

const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const drain=req=>new Promise(resolve=>{let text='';req.on('data',part=>{text+=part;});req.on('end',()=>{try{resolve(text?JSON.parse(text):{});}catch{resolve({});}});});
const stats=()=>({cacheMiB,torrent:{bytes:0,limit:cacheMiB*1048576,active:false},metadata:{bytes:0,limit:4*1048576},memory:process.memoryUsage()});
const tvService={
  name:'hasimio-tv-service-stand-in',
  enforce:'pre',
  configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url,'http://127.0.0.1'),pathname=url.pathname;
      if(!pathname.startsWith('/api/webos/'))return next();
      try{
        if(pathname==='/api/webos/fetch'&&req.method==='GET'){
          const remote=new URL(url.searchParams.get('url'));
          if(!['http:','https:'].includes(remote.protocol)||remote.username||remote.password||/^(localhost|127\.|0\.|169\.254\.|\[?::1\]?)/i.test(remote.hostname))throw Error('Invalid extension URL.');
          const response=await fetch(remote.href,{signal:AbortSignal.timeout(20000)});
          if(!response.ok)throw Error('The source returned HTTP '+response.status+'.');
          res.writeHead(200,{'Content-Type':response.headers.get('content-type')||'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
          res.end(await response.text());return;
        }
        if(pathname==='/api/webos/monitor'){if(req.method==='POST')await drain(req);json(res,200,req.method==='POST'?{ok:true}:{});return;}
        if(pathname==='/api/webos/updates'){if(req.method==='POST')await drain(req);json(res,200,{current:version,restartReady:false,checking:false,installing:false,canRollback:false,notice:'TV updates are not simulated on the PC.'});return;}
        if(pathname==='/api/webos/cache'){if(req.method==='POST'){const input=await drain(req);if([32,64].includes(input.cacheMiB))cacheMiB=input.cacheMiB;}else if(req.method==='DELETE')await drain(req);json(res,200,stats());return;}
        if(pathname==='/api/webos/stop'){await drain(req);json(res,200,{stopped:true});return;}
        json(res,404,{error:'Not part of the TV service stand-in.'});
      }catch(error){json(res,502,{error:error instanceof Error?error.message:'TV service stand-in failed.'});}
    });
  },
};
// vite.config.ts imports the engine, so the cache folder above must be set before this loads it.
const server=await createServer({plugins:[tvService],server:{host:'127.0.0.1',port,strictPort:true}});
await server.listen();
console.log(`Hasimio TV interface: http://127.0.0.1:${port}/webos.html (engine cache: ${process.env.HASIMIO_CACHE_DIR})`);
