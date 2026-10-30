// Hasimio Engine: the local streaming service on its own, for hosted copies of the Hasimio UI.
// node server/engine.mjs [--config engine.json] [--port 11475] [--lan] [--allow-origin https://hasimio.example]
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createMediaService} from './service.mjs';
import {parseOrigins,lanOrigins} from './torrent-utils.mjs';
import {cacheRoot} from './paths.mjs';
import {serveStatic} from './static-ui.mjs';

export const ENGINE_PORT=11475;
// Precedence: defaults, then environment, then the config file, then command-line flags. Allowed sites from all of them combine.
export function engineOptions(argv,env=process.env,readConfig=file=>JSON.parse(readFileSync(file,'utf8'))) {
  const options={port:Number(env.HASIMIO_ENGINE_PORT||ENGINE_PORT),host:'127.0.0.1',origins:[env.HASIMIO_ALLOWED_ORIGINS||'']};
  const cli={origins:[]};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--lan')cli.host='0.0.0.0';
    else if(arg==='--port')cli.port=Number(argv[++i]);
    else if(arg==='--allow-origin')cli.origins.push(argv[++i]??'');
    else if(arg==='--config'){cli.config=argv[++i];if(!cli.config)throw new Error('--config needs a file path.');}
    else if(arg==='--ui'){cli.uiRoot=argv[++i];if(!cli.uiRoot)throw new Error('--ui needs the built UI folder.');}
    else throw new Error(`Unknown option: ${arg}`);
  }
  if(cli.config){
    let config;try {config=readConfig(cli.config);}catch(error){throw new Error(`Could not read ${cli.config}: ${error.message}`);}
    if(!config||typeof config!=='object'||Array.isArray(config))throw new Error(`${cli.config} must contain a JSON object.`);
    if(config.port!=null)options.port=Number(config.port);
    if(config.lan===true)options.host='0.0.0.0';
    if(config.allowedOrigins!=null){if(!Array.isArray(config.allowedOrigins))throw new Error(`allowedOrigins in ${cli.config} must be a list of sites.`);options.origins.push(...config.allowedOrigins.map(String));}
  }
  if(cli.host)options.host=cli.host;
  if(cli.port!=null)options.port=cli.port;
  options.origins.push(...cli.origins);
  if(!Number.isInteger(options.port)||options.port<1||options.port>65535)throw new Error('The port must be a number from 1 to 65535.');
  return {port:options.port,host:options.host,allowedOrigins:parseOrigins(options.origins.filter(Boolean).join(',')),...(cli.uiRoot?{uiRoot:path.resolve(cli.uiRoot)}:{})};
}

// Starts the engine; with uiRoot it also serves that built UI folder, as the desktop app does. Rejects with error.code on listen failures.
export async function startEngine({port=ENGINE_PORT,host='127.0.0.1',allowedOrigins=new Set(),uiRoot}={}) {
  let relay;let server;
  // A loopback-only desktop engine cannot hand a TV its 127.0.0.1 media URL. A second, ephemeral
  // HTTP server on 0.0.0.0 serves only torrent media paths, and only after the first cast starts.
  const startRelay=async()=>{
    if(relay)return relay;
    const mediaServer=createServer((req,res)=>{
      let pathname='';
      try {pathname=new URL(req.url??'/','http://localhost').pathname;} catch {/**/}
      if(!['GET','HEAD'].includes(req.method)||!/^\/api\/torrents\/[a-f\d]{36}\/(?:files\/\d+|audio\/)/.test(pathname)){
        res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found.\n');
      }
      void service.handle(req,res);
    });
    try {await new Promise((resolve,reject)=>{mediaServer.once('error',reject);mediaServer.listen(0,'0.0.0.0',resolve);});}
    catch(error){mediaServer.close();throw error;}
    relay={server:mediaServer,port:mediaServer.address().port};
    return relay;
  };
  const castMediaOrigins=async()=>{
    if(host==='0.0.0.0'){const address=server.address();return lanOrigins(typeof address==='object'&&address?address.port:String(port));}
    return lanOrigins((await startRelay()).port);
  };
  const service=createMediaService({allowedOrigins,lan:host==='0.0.0.0',castMediaOrigins});
  server=createServer((req,res)=>{void service.handle(req,res,()=>{
    if(uiRoot)return void serveStatic(uiRoot,req,res);
    if(req.url==='/'&&['GET','HEAD'].includes(req.method)){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Hasimio Engine is running. Open the Hasimio app to play torrents.\n');}
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found.\n');
  });});
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}
  catch(error){await service.close();throw error;}
  let closing;
  const close=()=>closing??=(async()=>{
    server.close();server.closeAllConnections?.();
    await service.close();
    if(relay){relay.server.close();relay.server.closeAllConnections?.();}
  })();
  return {port:server.address().port,close};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let options;try {options=engineOptions(process.argv.slice(2));}catch(error){console.error(error.message);process.exit(2);}
  let engine;
  try {engine=await startEngine(options);}
  catch(error){console.error(error.code==='EADDRINUSE'?`Port ${options.port} is already in use. Is Hasimio Engine already running?`:error.message);process.exit(1);}
  console.log(`Hasimio Engine listening on http://${options.host==='0.0.0.0'?'0.0.0.0 (LAN)':options.host}:${engine.port}`);
  console.log(`Allowed sites: ${options.allowedOrigins.size?[...options.allowedOrigins].join(', '):'none (same-origin only)'}`);
  if(options.uiRoot)console.log(`Hasimio app: http://127.0.0.1:${engine.port}/`);
  console.log(`Cache: ${cacheRoot()}`);
  console.log('Keep this window open while you watch. Press Ctrl+C or close the window to stop.');
  // SIGHUP is how Windows reports the console window closing; there are a few seconds to clean up.
  for(const signal of ['SIGINT','SIGTERM','SIGHUP','SIGBREAK'])process.on(signal,()=>void engine.close().then(()=>process.exit(0)));
}
