import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
// The hosted site is a separate repository; skip when it is not checked out alongside.
const site=new URL('../sites/hasimio-sync/lib/sync-relay.mjs',import.meta.url),{syncFetch}=existsSync(site)?await import(site.href):{};
const token=()=>randomBytes(32).toString('base64url'),device=()=>({deviceId:randomBytes(16).toString('hex'),name:'Test device',deviceToken:token()});
const data={v:1,iv:'A'.repeat(16),data:'B'.repeat(32)},publicKey={kty:'EC',crv:'P-256',x:'A'.repeat(43),y:'B'.repeat(43)};
let sql,DB;
beforeEach(()=>{
  sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../sites/hasimio-sync/drizzle/0000_worthless_baron_zemo.sql',import.meta.url),'utf8'));
  DB={prepare(query){return {bind(...args){const execute=()=>{const statement=sql.prepare(query),results=statement.columns().length?statement.all(...args):[];let changes;if(!statement.columns().length)changes=statement.run(...args).changes;else changes=sql.prepare('SELECT changes() AS n').get().n;return {results,meta:{changes}};};return {execute,first:async()=>execute().results[0]??null,run:async()=>execute()};}};},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
});
afterEach(()=>sql.close());
async function request(route,method='GET',body,auth){
  const response=await syncFetch(new Request('https://sync.example/api/sync/'+route,{method,headers:{'cf-connecting-ip':'127.0.0.1',...(body?{'content-type':'application/json'}:{}),...(auth?{authorization:'Bearer '+auth}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB});
  return {status:response.status,body:await response.json(),headers:response.headers};
}
async function space(){const owner=device(),recoveryToken=token(),result=await request('spaces','POST',{...owner,recoveryToken,data});expect(result.status,result.body.error).toBe(201);return {...owner,recoveryToken,spaceId:result.body.spaceId};}
describe.skipIf(!syncFetch)('hosted D1 sync relay',()=>{
  it('authenticates every device and preserves concurrent updates with CAS',async()=>{
    const owner=await space(),route='spaces/'+owner.spaceId;
    expect((await request(route)).status).toBe(401);
    const results=await Promise.all([request(route,'PUT',{baseRevision:1,data},owner.deviceToken),request(route,'PUT',{baseRevision:1,data},owner.deviceToken)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    const result=await request(route,'GET',undefined,owner.deviceToken);expect(result.body.revision).toBe(2);expect(result.body.data).toEqual(data);
    const idle=await request(route+'?since=2','GET',undefined,owner.deviceToken);expect(idle.body).toMatchObject({revision:2,unchanged:true});expect(idle.body.data).toBeUndefined();expect(idle.body.devices).toHaveLength(1);
    expect((await request(route+'?since=1','GET',undefined,owner.deviceToken)).body.data).toEqual(data);
    const dump=JSON.stringify(sql.prepare('SELECT * FROM spaces').all())+JSON.stringify(sql.prepare('SELECT * FROM devices').all());expect(dump).not.toContain(owner.deviceToken);expect(dump).not.toContain(owner.recoveryToken);
  });
  it('makes concurrent QR redemption single-use and revokes new-device access',async()=>{
    const owner=await space(),route='spaces/'+owner.spaceId,phone=device();
    const invite=await request(route+'/invites','POST',{},owner.deviceToken);
    const results=await Promise.all([request('invites/redeem','POST',{...phone,invite:invite.body.invite}),request('invites/redeem','POST',{...device(),invite:invite.body.invite})]);
    expect(results.map(r=>r.status).sort()).toEqual([201,404]);
    expect((await request(route,'GET',undefined,phone.deviceToken)).status).toBe(200);
    await request(route+'/devices/'+phone.deviceId,'DELETE',undefined,owner.deviceToken);
    expect((await request(route,'GET',undefined,phone.deviceToken)).status).toBe(401);
  });
  it('requires owner approval for TV codes and prevents approving into two spaces',async()=>{
    const owner=await space(),other=await space(),tv=device(),pair=await request('pairings','POST',{...tv,publicKey});
    expect((await request('pairings/'+pair.body.code)).status).toBe(404);
    const approval={bundle:data,publicKey,deviceToken:tv.deviceToken};
    expect((await request('spaces/'+owner.spaceId+'/pairings/'+pair.body.code,'POST',approval)).status).toBe(401);
    const results=await Promise.all([request('spaces/'+owner.spaceId+'/pairings/'+pair.body.code,'POST',approval,owner.deviceToken),request('spaces/'+other.spaceId+'/pairings/'+pair.body.code,'POST',approval,other.deviceToken)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    expect(sql.prepare('SELECT count(*) AS n FROM devices WHERE id=?').get(tv.deviceId).n).toBe(1);
    expect((await request('pairings/'+pair.body.code,'GET',undefined,pair.body.pollToken)).body.status).toBe('approved');
  });
  it('expires pairing credentials and limits attempts durably',async()=>{
    const owner=await space(),route='spaces/'+owner.spaceId,invite=await request(route+'/invites','POST',{},owner.deviceToken),pair=await request('pairings','POST',{...device(),publicKey});
    sql.exec('UPDATE invites SET expires=0; UPDATE pairings SET expires=0');
    expect((await request('invites/redeem','POST',{...device(),invite:invite.body.invite})).status).toBe(404);
    expect((await request('pairings/'+pair.body.code,'GET',undefined,pair.body.pollToken)).status).toBe(404);
    for(let i=0;i<8;i++)await request(route+'/pairings/123456','GET',undefined,owner.deviceToken);
    expect((await request(route+'/pairings/123456','GET',undefined,owner.deviceToken)).status).toBe(429);
    expect(JSON.stringify(sql.prepare('SELECT * FROM rates').all())).not.toContain('127.0.0.1');
  });
  it('recovers only with the recovery credential and respects the device limit',async()=>{
    const owner=await space(),route='spaces/'+owner.spaceId;
    expect((await request('recover','POST',{...device(),spaceId:owner.spaceId,recoveryToken:owner.deviceToken})).status).toBe(401);
    const replacement=device();expect((await request('recover','POST',{...replacement,spaceId:owner.spaceId,recoveryToken:owner.recoveryToken})).status).toBe(201);
    const invite=await request(route+'/invites','POST',{},owner.deviceToken);
    await request(route+'/devices/'+owner.deviceId,'DELETE',undefined,replacement.deviceToken);
    expect((await request('invites/redeem','POST',{...device(),invite:invite.body.invite})).status).toBe(404);
    const insert=sql.prepare('INSERT INTO devices VALUES (?,?,?,?,?,?)');for(let i=0;i<19;i++){const d=device();insert.run(owner.spaceId,d.deviceId,d.name,token(),1,1);}
    expect((await request('recover','POST',{...device(),spaceId:owner.spaceId,recoveryToken:owner.recoveryToken})).status).toBe(401);
  });
  it('rejects malformed data and sends no-store CORS responses',async()=>{
    const result=await request('info');expect(result.body.appUrl).toBe('https://sync.example');expect(result.headers.get('cache-control')).toBe('no-store');expect(result.headers.get('access-control-allow-origin')).toBe('*');
    expect((await request('spaces','POST',{...device(),recoveryToken:token(),data:{v:1}})).status).toBe(400);
  });
});
