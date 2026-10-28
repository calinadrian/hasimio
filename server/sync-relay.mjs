// Standalone encrypted sync relay. Never mount this on the torrent engine.
import {createServer} from 'node:http';
import {randomBytes,randomInt,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {serveStatic} from './static-ui.mjs';
import {ID,TOKEN,MAX_BODY,fail,envelope,publicKey,deviceInput as validDevice,pairingInput} from '../shared/sync-protocol.mjs';

const id=()=>randomBytes(16).toString('hex'),secret=()=>randomBytes(32).toString('base64url');
const hash=value=>createHash('sha256').update(value).digest('hex');
const equal=(value,digest)=>typeof value==='string'&&typeof digest==='string'&&timingSafeEqual(Buffer.from(hash(value),'hex'),Buffer.from(digest,'hex'));
const tokenOK=value=>typeof value==='string'&&TOKEN.test(value);
function deviceInput(body){const device=validDevice(body);return {id:device.deviceId,name:device.name,tokenHash:hash(device.deviceToken),addedAt:Date.now(),lastSeen:Date.now()};}
const publicDevice=d=>({id:d.id,name:d.name,addedAt:d.addedAt,lastSeen:d.lastSeen});

export function createSyncRelay({dataDir,publicUrl='',uiRoot,now=Date.now,trustProxy=false,onError=()=>{}}={}){
  if(!dataDir)throw Error('A persistent sync data directory is required.');
  const root=path.resolve(dataDir),pairs=new Map(),invites=new Map(),limits=new Map();let queue=Promise.resolve();
  const mutate=task=>{const work=queue.catch(()=>{}).then(task);queue=work.catch(()=>{});return work;};
  const filename=space=>{if(typeof space!=='string'||!ID.test(space))fail(404,'Sync space not found.');return path.join(root,space+'.json');};
  async function load(space){try{return JSON.parse(await readFile(filename(space),'utf8'));}catch(error){if(error.status)throw error;fail(404,'Sync space not found.');}}
  async function save(space){await mkdir(root,{recursive:true});const target=filename(space.id),temp=target+'.tmp';await writeFile(temp,JSON.stringify(space),{mode:0o600,flush:true});for(let attempt=0;;attempt++){try{await rename(temp,target);break;}catch(error){if(attempt>=5||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)));}}}
  function auth(space,req){const raw=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];const device=space.devices.find(d=>tokenOK(raw)&&equal(raw,d.tokenHash));if(!device)fail(401,'This device is not linked, or its access was removed.');return device;}
  function addDevice(space,body){if(space.devices.length>=20)fail(409,'This sync space already has 20 devices. Unlink one first.');const device=deviceInput(body);if(space.devices.some(d=>d.id===device.id))fail(409,'This device is already linked.');space.devices.push(device);return device;}
  function prune(){for(const map of [pairs,invites])for(const [key,value] of map)if(value.expires<=now())map.delete(key);for(const [key,value] of limits)if(value.until<=now())limits.delete(key);}
  // The trusted proxy appends the address it saw, so only the last entry is not client-controlled.
  function limit(req,bucket,max=12,period=60000){prune();const ip=trustProxy?String(req.headers['x-forwarded-for']??req.socket?.remoteAddress??'unknown').split(',').at(-1).trim():req.socket?.remoteAddress??'unknown',key=bucket+':'+ip;let entry=limits.get(key);if(!entry){if(limits.size>=10000)limits.delete(limits.keys().next().value);entry={count:0,until:now()+period};limits.set(key,entry);}if(++entry.count>max)fail(429,'Too many attempts. Please wait a minute and try again.');}
  async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'Send JSON.');const chunks=[];let size=0;for await(const part of req){const chunk=Buffer.from(part);size+=chunk.length;if(size>MAX_BODY)fail(413,'Sync data is too large.');chunks.push(chunk);}let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'Invalid JSON.');}if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Send a JSON object.');return value;}
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(data));}
  async function handle(req,res){
    const url=new URL(req.url??'/','http://relay');
    if(!url.pathname.startsWith('/api/sync/')){if(uiRoot&&!url.pathname.startsWith('/api/'))return serveStatic(uiRoot,req,res);return json(res,404,{error:'Not found.'});}
    // No cookies: each request authenticates with an unguessable device bearer.
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    try{
      if(req.method==='GET'&&url.pathname==='/api/sync/info')return json(res,200,{version:1,appUrl:publicUrl||null});
      if(req.method==='POST'&&url.pathname==='/api/sync/spaces'){
        limit(req,'create',5,3600000);const input=await body(req),device=deviceInput(input);if(!tokenOK(input.recoveryToken))fail(400,'Invalid recovery key.');const data=envelope(input.data);
        const space=await mutate(async()=>{await mkdir(root,{recursive:true});if((await readdir(root)).filter(f=>f.endsWith('.json')).length>=10000)fail(503,'This relay has reached its storage limit.');const space={id:id(),revision:1,data,recoveryHash:hash(input.recoveryToken),devices:[device]};await save(space);return space;});
        return json(res,201,{spaceId:space.id,revision:space.revision});
      }
      if(req.method==='POST'&&url.pathname==='/api/sync/recover'){
        limit(req,'recover',6);const input=await body(req);
        await mutate(async()=>{const space=await load(input.spaceId);if(!tokenOK(input.recoveryToken)||!equal(input.recoveryToken,space.recoveryHash))fail(401,'Recovery code was not accepted.');addDevice(space,input);await save(space);});return json(res,201,{linked:true});
      }
      if(req.method==='POST'&&url.pathname==='/api/sync/pairings'){
        limit(req,'pair-create',10);const input=pairingInput(await body(req));if(pairs.size>=500)fail(503,'Pairing is busy. Try again shortly.');
        let code;do{code=String(randomInt(1000000)).padStart(6,'0');}while(pairs.has(code));const pollToken=secret(),expires=now()+300000;
        pairs.set(code,{...input,pollHash:hash(pollToken),expires});return json(res,201,{code,pollToken,expires});
      }
      const poll=/^\/api\/sync\/pairings\/(\d{6})$/.exec(url.pathname);
      if(poll&&req.method==='GET'){
        limit(req,'pair-poll',120);prune();const pair=pairs.get(poll[1]),raw=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];if(!pair||!tokenOK(raw)||!equal(raw,pair.pollHash))fail(404,'Pairing code expired. Generate a new code.');
        return json(res,200,pair.approval?{status:'approved',...pair.approval}:{status:'pending',expires:pair.expires});
      }
      if(req.method==='POST'&&url.pathname==='/api/sync/invites/redeem'){
        limit(req,'redeem',12);const input=await body(req);if(!tokenOK(input.invite))fail(400,'Invalid pairing link.');
        const spaceId=await mutate(async()=>{prune();const invite=invites.get(hash(input.invite));if(!invite)fail(404,'Pairing link expired or was already used.');const space=await load(invite.spaceId);if(!space.devices.some(d=>d.id===invite.by))fail(401,'The device that created this link was unlinked.');addDevice(space,input);await save(space);invites.delete(hash(input.invite));return space.id;});return json(res,201,{spaceId});
      }
      const route=/^\/api\/sync\/spaces\/([a-f\d]{32})(?:\/(devices|invites|pairings)(?:\/([a-f\d]{32}|\d{6}))?)?$/.exec(url.pathname);
      if(!route)fail(404,'Sync endpoint not found.');
      const [,spaceId,resource,target]=route;
      // Idle devices poll with ?since=<revision> and skip the snapshot when nothing changed.
      if(req.method==='GET'&&!resource){await queue;const space=await load(spaceId);auth(space,req);const devices=space.devices.map(publicDevice);return json(res,200,url.searchParams.get('since')===String(space.revision)?{revision:space.revision,unchanged:true,devices}:{revision:space.revision,data:space.data,devices});}
      if(req.method==='GET'&&resource==='pairings'&&target){limit(req,'pair-preview',8);prune();const space=await load(spaceId);auth(space,req);const pair=pairs.get(target);if(!pair||pair.approval)fail(404,'Pairing code expired or was already approved.');return json(res,200,{deviceId:pair.deviceId,name:pair.name,publicKey:pair.publicKey,expires:pair.expires});}
      const input=['POST','PUT'].includes(req.method)?await body(req):{};
      const result=await mutate(async()=>{
        const space=await load(spaceId),device=auth(space,req);
        if(req.method==='PUT'&&!resource){const data=envelope(input.data);if(input.baseRevision!==space.revision)fail(409,'Sync changed on another device. Retrying merge.');space.data=data;space.revision++;device.lastSeen=now();await save(space);return {revision:space.revision};}
        if(req.method==='POST'&&resource==='invites'&&!target){limit(req,'invite',10);if(invites.size>=1000)fail(503,'Pairing is busy.');const token=secret(),expires=now()+300000;invites.set(hash(token),{spaceId,by:device.id,expires});return {invite:token,expires};}
        if(req.method==='POST'&&resource==='pairings'&&target){limit(req,'pair-approve',8);prune();const pair=pairs.get(target);if(!pair||pair.approval)fail(404,'Pairing code expired or was already approved.');const bundle=envelope(input.bundle),sender=publicKey(input.publicKey);addDevice(space,{deviceId:pair.deviceId,name:pair.name,deviceToken:input.deviceToken});await save(space);pair.approval={bundle,publicKey:sender};return {approved:true};}
        if(req.method==='DELETE'&&resource==='devices'&&target){space.devices=space.devices.filter(d=>d.id!==target);await save(space);for(const [key,invite] of invites)if(invite.spaceId===spaceId&&invite.by===target)invites.delete(key);return {unlinked:true};}
        fail(404,'Sync endpoint not found.');
      });return json(res,200,result);
    }catch(error){if(!error.status)onError(error);if(!res.headersSent)json(res,error.status??500,{error:error.status?error.message:'The sync service could not complete this request.'});else res.destroy();}
  }
  return {handle,close:()=>queue};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const relay=createSyncRelay({dataDir:process.env.HASIMIO_SYNC_DATA_DIR||'.sync-data',publicUrl:process.env.HASIMIO_SYNC_PUBLIC_URL||'',uiRoot:path.resolve(process.env.HASIMIO_SYNC_UI_DIR||'dist'),trustProxy:process.env.HASIMIO_SYNC_TRUST_PROXY==='1',onError:error=>console.error('Sync relay request failed:',error.code||error.name)});
  const host=process.env.HASIMIO_SYNC_HOST||'127.0.0.1',port=Number(process.env.PORT||8787);const server=createServer((req,res)=>void relay.handle(req,res));server.listen(port,host,()=>console.log('Hasimio sync relay listening on '+host+':'+port));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();server.closeAllConnections();void relay.close().then(()=>process.exit(0));});
}
