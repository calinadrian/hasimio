// Real Chrome + local fixture only. The fixture click stands in for the human.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openAuthenticatedSession} from './browser-auth.mjs';

await mkdir('.cache/browser-auth-tests',{recursive:true});
const folder=await mkdtemp(path.resolve('.cache/browser-auth-tests/run-'));
const sessions=new Set();
const server=createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  if(req.url==='/session'&&req.method==='POST'){
    const token=randomUUID();sessions.add(token);res.setHeader('Set-Cookie',`fixture_session=${token}; Path=/; HttpOnly; SameSite=Lax`);res.end('ok');return;
  }
  const cookie=/fixture_session=([^;]+)/.exec(req.headers.cookie??'')?.[1];
  if(req.url==='/protected'&&sessions.has(cookie)){
    res.end(`<script>const request=indexedDB.open('fixture',1);request.onsuccess=()=>{const db=request.result;const read=db.transaction('session').objectStore('session').get('signed-in');read.onsuccess=()=>{if(localStorage.getItem('fixture-signed-in')==='yes'&&read.result==='yes'){document.body.innerHTML='<div data-testid="authenticated">Signed in</div>';}};};</script>`);return;
  }
  res.end(`<button id="login">Sign in to local fixture</button><script>document.querySelector('#login').onclick=async()=>{localStorage.setItem('fixture-signed-in','yes');await new Promise((resolve,reject)=>{const r=indexedDB.open('fixture',1);r.onupgradeneeded=()=>r.result.createObjectStore('session');r.onerror=reject;r.onsuccess=()=>{const db=r.result;const t=db.transaction('session','readwrite');t.objectStore('session').put('yes','signed-in');t.oncomplete=()=>{db.close();resolve();};};});await fetch('/session',{method:'POST'});location='/protected';};</script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const config={loginUrl:origin+'/login',checkUrl:origin+'/protected',authenticatedSelector:'[data-testid="authenticated"]',statePath:path.join(folder,'state.json'),profileDir:path.join(folder,'profile'),mode:'state',channel:process.env.HASIMIO_AUTH_BROWSER??'chrome',checkTimeoutMs:500,loginTimeoutMs:3000};
const fakeHuman=page=>page.getByRole('button',{name:'Sign in to local fixture',exact:true}).click();
const resources=[];
async function open(options,hooks={}){const result=await openAuthenticatedSession({...config,...options},hooks);resources.push(result);return result;}
try{
  await assert.rejects(open({interactive:false,headless:true}),{code:'AUTH_REQUIRED'});
  const first=await open({interactive:true},{onLoginRequired:fakeHuman});assert.equal(first.reused,false);await first.close();
  const saved=JSON.parse(await readFile(config.statePath,'utf8'));assert(saved.cookies.some(cookie=>cookie.name==='fixture_session'&&cookie.httpOnly));assert(saved.origins[0].localStorage.length);assert(saved.origins[0].indexedDB.length);
  const second=await open({interactive:false,headless:true});assert.equal(second.reused,true);await second.close();
  console.log('PASS: manually completed fixture login restores cookies, local storage and IndexedDB in a new browser.');
  const before=await readFile(config.statePath,'utf8');sessions.clear();
  await assert.rejects(open({interactive:false,headless:true}),{code:'AUTH_REQUIRED'});assert.equal(await readFile(config.statePath,'utf8'),before);
  const refreshed=await open({interactive:true},{onLoginRequired:fakeHuman});assert.equal(refreshed.reused,false);await refreshed.close();
  console.log('PASS: expired sessions require manual login; failed checks preserve the saved state.');
  await assert.rejects(open({interactive:true,loginTimeoutMs:200,statePath:path.join(folder,'timeout.json')}),{code:'AUTH_REQUIRED'});
  await assert.rejects(readFile(path.join(folder,'timeout.json')),{code:'ENOENT'});
  await assert.rejects(open({interactive:true,statePath:path.join(folder,'cancelled.json')},{onLoginRequired:page=>page.close()}),{code:'AUTH_REQUIRED'});
  await assert.rejects(readFile(path.join(folder,'cancelled.json')),{code:'ENOENT'});
  const controller=new AbortController();
  await assert.rejects(open({interactive:true,statePath:path.join(folder,'aborted.json')},{signal:controller.signal,onLoginRequired:()=>controller.abort(new Error('Operator cancelled'))}),/Operator cancelled/);
  await assert.rejects(readFile(path.join(folder,'aborted.json')),{code:'ENOENT'});
  console.log('PASS: cancellation closes the browser without saving an unauthenticated state.');
  const profileConfig={mode:'profile',statePath:path.join(folder,'profile-state.json')};
  const profile=await open({...profileConfig,interactive:true},{onLoginRequired:fakeHuman});await profile.close();
  const restored=await open({...profileConfig,interactive:false});assert.equal(restored.reused,true);await restored.close();
  console.log('PASS: a dedicated persistent profile survives browser restarts.');
}finally{for(const resource of resources)await resource.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
