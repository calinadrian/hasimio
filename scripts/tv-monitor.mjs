import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const device=process.env.HASIMIO_TV_DEVICE||'lgtv', port=Number(process.env.HASIMIO_TV_MONITOR_PORT||11477);
if(!/^[\w.-]{1,64}$/.test(device)||!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid TV device or monitor port.');
const cli=process.env.HASIMIO_WEBOS_NOVACOM||path.join(process.env.APPDATA||'', 'npm/node_modules/@webos-tools/cli/bin/ares-novacom.js');
await fs.access(cli);
const directory=path.join(root,'.cache','tv-monitor'), logFile=path.join(directory,'monitor.jsonl');
await fs.mkdir(directory,{recursive:true});
const token=crypto.randomBytes(24).toString('hex');
const page=(await fs.readFile(path.join(root,'scripts','tv-monitor.html'),'utf8')).replace('__TOKEN__',token);
const state={connected:false,lastPollAt:0,lastSuccess:0,error:'Waiting for the first TV reading.',device,data:null,samples:[],events:[],logFile};
const children=new Set();
let timer, closing=false, logQueue=Promise.resolve(), boot, lastEvent=0, lastConnection;
function log(entry){
  logQueue=logQueue.then(async()=>{
    const text=JSON.stringify(entry)+'\n';
    const size=await fs.stat(logFile).then(value=>value.size,()=>0);
    if(size+Buffer.byteLength(text)>1024*1024){
      await fs.rm(logFile+'.1',{force:true});await fs.rename(logFile,logFile+'.1');
    }
    await fs.appendFile(logFile,text);
  }).catch(()=>{state.logError='The PC log could not be written.';});
}
function pcEvent(level,code,message){
  const event={at:Date.now(),level,code,message,count:1};
  state.events.push(event);if(state.events.length>200)state.events.shift();log({kind:'event',...event});
}
function command(remote){
  return new Promise((resolve,reject)=>{
    const processChild=spawn(process.execPath,[cli,'--device',device,'--run',remote],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    children.add(processChild);
    let output='',errors='',tooLarge=false;
    const timeout=setTimeout(()=>{processChild.kill();},8000);
    processChild.stdout.on('data',value=>{output+=value;if(output.length>128*1024){tooLarge=true;processChild.kill();}});
    processChild.stderr.on('data',value=>{if(errors.length<1000)errors+=value;});
    processChild.once('error',error=>{clearTimeout(timeout);reject(error);});
    processChild.once('close',code=>{
      clearTimeout(timeout);children.delete(processChild);
      if(tooLarge)return reject(Error('The diagnostic response exceeded its size limit.'));
      if(code!==0)return reject(Error('Cannot reach the TV service. Turn on the TV, open Hasimio and check Developer Mode/network access.'));
      const begin=output.indexOf('{');
      try{const data=JSON.parse(output.slice(begin));if(begin<0||!data||typeof data!=='object')throw Error();resolve(data);}
      catch{reject(Error('The TV service did not return diagnostics. Open Hasimio on the TV.'));}
    });
  });
}
async function poll(){
  try{
    const data=await command('curl --silent --show-error --max-time 4 http://127.0.0.1:11476/api/webos/monitor');
    if(data.schema!==1)throw Error('Install Hasimio TV v0.1.41 or newer to enable monitoring.');
    state.lastPollAt=Date.now();state.lastSuccess=Date.now();state.connected=true;state.error='';state.data=data;
    if(lastConnection!==true)pcEvent('info','connected','Connected to the TV service.');
    lastConnection=true;
    if(boot!==data.boot){
      if(boot)pcEvent('warning','service-restarted','The TV service restarted. Its in-memory counters were reset.');
      boot=data.boot;lastEvent=0;
    }
    for(const event of data.events||[]){
      const previous=state.events.find(value=>value.boot===boot&&value.id===event.id);
      if(previous){if(previous.count!==event.count){Object.assign(previous,{...event,boot,at:Date.now(),tvAt:event.at});log({kind:'tv-event',boot,...event});}continue;}
      if(event.id<=lastEvent)continue;
      state.events.push({...event,boot,at:Date.now(),tvAt:event.at});
      if(state.events.length>200)state.events.shift();
      lastEvent=event.id;log({kind:'tv-event',boot,...event});
    }
    const torrent=data.torrent;
    const sample={at:Date.now(),rss:data.memory.rss,cacheBytes:torrent.bytes,limit:torrent.limit,
      generation:torrent.generation,state:torrent.state,receivedBytes:torrent.receivedBytes,servedBytes:torrent.servedBytes,
      evictedBytes:torrent.store?.evictedBytes||0,metadataBytes:data.metadata.bytes,conditions:data.conditions};
    state.samples.push(sample);if(state.samples.length>120)state.samples.shift();log({kind:'sample',boot,...sample});
  }catch(error){
    state.lastPollAt=Date.now();state.connected=false;state.error=error.message;
    if(lastConnection!==false)pcEvent('warning','disconnected',error.message);
    lastConnection=false;
  }finally{if(!closing)timer=setTimeout(poll,5000);}
}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return json(res,403,{error:'Local monitor access only.'});
  try{
    if(req.method==='GET'&&req.url==='/health')return json(res,200,{app:'hasimio-tv-monitor',device});
    if(req.method==='GET'&&req.url==='/snapshot')return json(res,200,state);
    if(req.method==='GET'&&req.url==='/report'){
      res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="hasimio-tv-report.json"','Cache-Control':'no-store'});res.end(JSON.stringify(state,null,2));return;
    }
    if(req.method==='POST'&&req.headers['x-monitor-token']===token){
      if(req.url==='/clear'){
        if(state.clearing)return json(res,409,{error:'Cleanup is already running.'});
        state.clearing=true;
        try{
          const value=await command('curl --silent --show-error --max-time 6 -X DELETE http://127.0.0.1:11476/api/webos/cache');
          if(value.error)throw Error(value.error);
          if(value.torrent?.active||value.torrent?.bytes!==0)throw Error('The TV did not confirm an empty video buffer.');
          pcEvent('info','manual-cleanup','The TV confirmed its video buffer is empty and playback stopped.');json(res,200,{ok:true});
        }finally{state.clearing=false;}
        return;
      }
      if(req.url==='/stop'){json(res,200,{ok:true});void shutdown();return;}
    }
    if(req.method==='GET'&&req.url==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'nonce-"+token+"'; style-src 'nonce-"+token+"'; connect-src 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});res.end(page.replaceAll('__NONCE__',token));return;
    }
    json(res,404,{error:'Not found.'});
  }catch(error){if(!res.headersSent)json(res,500,{error:error.message});else res.destroy();}
});
async function shutdown(){
  if(closing)return;closing=true;clearTimeout(timer);children.forEach(child=>child.kill());server.close();await logQueue;process.exit(0);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void shutdown());
server.on('error',error=>{console.error('Monitor could not start:',error.code);void shutdown();});
server.listen(port,'127.0.0.1',()=>{console.log('Hasimio TV monitor: http://127.0.0.1:'+port);void poll();});
