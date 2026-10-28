import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {randomBytes} from 'node:crypto';
import {createSyncRelay} from './sync-relay.mjs';
const token=()=>randomBytes(32).toString('base64url'),device=()=>({deviceId:randomBytes(16).toString('hex'),name:'Test device',deviceToken:token()});
const data={v:1,iv:'A'.repeat(16),data:'B'.repeat(32)};
let directory,relay,clock,lastError;
beforeEach(async()=>{await mkdir('.cache',{recursive:true});directory=await mkdtemp(path.resolve('.cache/sync-unit-'));clock=1000;relay=createSyncRelay({dataDir:directory,publicUrl:'https://sync.example.com',now:()=>clock,onError:error=>lastError=error});});
afterEach(async()=>{await relay.close();await rm(directory,{recursive:true,force:true});});
async function request(route,method='GET',body,auth,ip='127.0.0.1'){
  const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);Object.assign(req,{url:'/api/sync/'+route,method,headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(auth?{authorization:'Bearer '+auth}:{})},socket:{remoteAddress:ip}});
  let status,result;const headers={};const res={setHeader:(key,value)=>headers[key]=value,writeHead:(code)=>status=code,end:text=>{if(text)result=JSON.parse(text);}};
  await relay.handle(req,res);return {status,body:result,headers};
}
async function space(){const owner=device(),recoveryToken=token(),created=await request('spaces','POST',{...owner,recoveryToken,data});expect(created.status,lastError?.stack).toBe(201);return {...owner,recoveryToken,spaceId:created.body.spaceId};}
describe('encrypted sync relay',()=>{
  it('persists ciphertext across restarts, hashes credentials, and enforces revisions',async()=>{
    const owner=await space(),route='spaces/'+owner.spaceId;
    expect((await request(route)).status).toBe(401);expect((await request(route,'GET',undefined,token())).status).toBe(401);
    expect((await request(route,'PUT',{baseRevision:1,data},owner.deviceToken)).status,lastError?.stack).toBe(200);
    expect((await request(route,'PUT',{baseRevision:1,data},owner.deviceToken)).status).toBe(409);
    const disk=await readFile(path.join(directory,owner.spaceId+'.json'),'utf8');expect(disk).not.toContain(owner.deviceToken);expect(disk).not.toContain(owner.recoveryToken);
    await relay.close();relay=createSyncRelay({dataDir:directory});const restored=await request(route,'GET',undefined,owner.deviceToken);expect(restored.body.revision).toBe(2);expect(restored.body.data).toEqual(data);
  });
  it('decodes multi-byte device names split across request chunks',async()=>{
    const bytes=Buffer.from(JSON.stringify({...device(),name:'Größe TV',recoveryToken:token(),data})),split=bytes.indexOf(Buffer.from('ö'))+1;
    const req=Readable.from([bytes.subarray(0,split),bytes.subarray(split)]);Object.assign(req,{url:'/api/sync/spaces',method:'POST',headers:{'content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}});
    let status;const res={setHeader(){},writeHead:code=>status=code,end(){}};await relay.handle(req,res);expect(status,lastError?.stack).toBe(201);
    const [file]=(await import('node:fs/promises').then(fs=>fs.readdir(directory))).filter(name=>name.endsWith('.json'));
    expect(JSON.parse(await readFile(path.join(directory,file),'utf8')).devices[0].name).toBe('Größe TV');
  });
  it('redeems a QR invitation once and revokes the new device without affecting the owner',async()=>{
    const owner=await space(),route='spaces/'+owner.spaceId,newDevice=device();
    const invite=await request(route+'/invites','POST',{},owner.deviceToken);
    expect((await request('invites/redeem','POST',{...newDevice,invite:invite.body.invite})).status).toBe(201);
    expect((await request('invites/redeem','POST',{...device(),invite:invite.body.invite})).status).toBe(404);
    expect((await request(route,'GET',undefined,newDevice.deviceToken)).status).toBe(200);
    expect((await request(route+'/devices/'+newDevice.deviceId,'DELETE',undefined,owner.deviceToken)).status).toBe(200);
    expect((await request(route,'GET',undefined,newDevice.deviceToken)).status).toBe(401);expect((await request(route,'GET',undefined,owner.deviceToken)).status).toBe(200);
  });
  it('protects TV polling and requires an authorized device to approve a code',async()=>{
    const owner=await space(),target=device(),publicKey={kty:'EC',crv:'P-256',x:'A'.repeat(43),y:'B'.repeat(43)};
    const pending=await request('pairings','POST',{deviceId:target.deviceId,name:target.name,publicKey});expect(pending.body.code).toMatch(/^\d{6}$/);
    expect((await request('pairings/'+pending.body.code)).status).toBe(404);
    expect((await request('spaces/'+owner.spaceId+'/pairings/'+pending.body.code,'GET',undefined,owner.deviceToken)).body.name).toBe('Test device');
    expect((await request('spaces/'+owner.spaceId+'/pairings/'+pending.body.code,'POST',{bundle:data,publicKey,deviceToken:target.deviceToken})).status).toBe(401);
    expect((await request('spaces/'+owner.spaceId+'/pairings/'+pending.body.code,'POST',{bundle:data,publicKey,deviceToken:target.deviceToken},owner.deviceToken)).status).toBe(200);
    const result=await request('pairings/'+pending.body.code,'GET',undefined,pending.body.pollToken);expect(result.body.status).toBe('approved');expect(result.body.bundle).toEqual(data);
    expect((await request('spaces/'+owner.spaceId,'GET',undefined,target.deviceToken)).status).toBe(200);
  });
  it('expires invitations and pairing codes and rate limits guessing',async()=>{
    const owner=await space(),route='spaces/'+owner.spaceId;
    const invite=await request(route+'/invites','POST',{},owner.deviceToken),pending=await request('pairings','POST',{...device(),publicKey:{kty:'EC',crv:'P-256',x:'A'.repeat(43),y:'B'.repeat(43)}});
    clock+=300001;
    expect((await request('invites/redeem','POST',{...device(),invite:invite.body.invite})).status).toBe(404);
    expect((await request('pairings/'+pending.body.code,'GET',undefined,pending.body.pollToken)).status).toBe(404);
    for(let i=0;i<8;i++)await request(route+'/pairings/123456','GET',undefined,owner.deviceToken);
    expect((await request(route+'/pairings/123456','GET',undefined,owner.deviceToken)).status).toBe(429);
  });
  it('recovers only with the separate recovery secret and invalidates invites from removed devices',async()=>{
    const owner=await space(),route='spaces/'+owner.spaceId,invite=await request(route+'/invites','POST',{},owner.deviceToken);
    expect((await request('recover','POST',{spaceId:owner.spaceId,recoveryToken:owner.deviceToken,...device()})).status).toBe(401);
    const replacement=device();expect((await request('recover','POST',{spaceId:owner.spaceId,recoveryToken:owner.recoveryToken,...replacement})).status).toBe(201);
    await request(route+'/devices/'+owner.deviceId,'DELETE',undefined,replacement.deviceToken);
    expect((await request('invites/redeem','POST',{...device(),invite:invite.body.invite})).status).toBe(404);
  });
});
