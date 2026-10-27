// Runs Hasimio Engine in an Electron utility process, so torrenting and FFmpeg work never block the window.
import {startEngine} from '../server/engine.mjs';
import {parseOrigins} from '../server/torrent-utils.mjs';

let engine;
process.parentPort.once('message',async({data})=>{
  try {
    engine=await startEngine({port:data.port,uiRoot:data.uiRoot,allowedOrigins:parseOrigins((data.allowedOrigins??[]).join(','))});
    process.parentPort.postMessage({type:'ready',port:engine.port});
  } catch(error){
    process.parentPort.postMessage({type:'error',code:error.code,message:error.message});
    process.exit(1);
  }
  process.parentPort.on('message',async({data:message})=>{if(message?.type==='stop'){await engine.close();process.exit(0);}});
});
