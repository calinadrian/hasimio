import {afterEach,describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {randomBytes} from 'node:crypto';
import {envelope,pairingInput,deviceInput,MAX_DATA} from './sync-protocol.mjs';
import {createSyncRelay} from '../server/sync-relay.mjs';
const directories=[];
afterEach(async()=>{for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
describe('shared sync protocol',()=>{
  const copy=new URL('../sites/hasimio-sync/lib/sync-protocol.mjs',import.meta.url);
  it.skipIf(!existsSync(copy))('is the exact copy the hosted relay deploys with',()=>{
    expect(readFileSync(copy,'utf8').replace(/\r\n/g,'\n')).toBe(readFileSync(new URL('./sync-protocol.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n'));
  });
  it('accepts the same ciphertext size on every relay and normalizes stored fields',()=>{
    expect(envelope({v:1,iv:'A'.repeat(16),data:'B'.repeat(MAX_DATA),extra:'dropped'})).toEqual({v:1,iv:'A'.repeat(16),data:'B'.repeat(MAX_DATA)});
    expect(()=>envelope({v:1,iv:'A'.repeat(16),data:'B'.repeat(MAX_DATA+1)})).toThrow(expect.objectContaining({status:413}));
    expect(()=>pairingInput({deviceId:'a'.repeat(32),name:' TV ',publicKey:{kty:'EC',crv:'P-256',x:1,y:2}})).toThrow(expect.objectContaining({status:400}));
    expect(()=>deviceInput({deviceId:'a'.repeat(32),name:'TV',deviceToken:['x'.repeat(43)]})).toThrow(expect.objectContaining({status:400}));
  });
  it('rate limits by the address the trusted proxy appended, not a client-supplied one',async()=>{
    await mkdir('.cache',{recursive:true});const directory=await mkdtemp(path.resolve('.cache/sync-proxy-'));directories.push(directory);
    const relay=createSyncRelay({dataDir:directory,trustProxy:true});
    const create=async spoofed=>{
      const body={deviceId:randomBytes(16).toString('hex'),name:'Device',deviceToken:randomBytes(32).toString('base64url'),recoveryToken:randomBytes(32).toString('base64url'),data:{v:1,iv:'A'.repeat(16),data:'B'.repeat(32)}};
      const req=Object.assign(Readable.from([JSON.stringify(body)]),{url:'/api/sync/spaces',method:'POST',headers:{'content-type':'application/json','x-forwarded-for':spoofed+', 203.0.113.9'},socket:{remoteAddress:'10.0.0.2'}});
      let status;await relay.handle(req,{setHeader(){},writeHead:code=>status=code,end(){}});return status;
    };
    const statuses=[];for(let i=0;i<6;i++)statuses.push(await create('198.51.100.'+i));
    expect(statuses).toEqual([201,201,201,201,201,429]);await relay.close();
  });
});
