// Runs on a disposable Apple Silicon runner after signing the previous and candidate builds.
import assert from 'node:assert/strict';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdtemp,readFile,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {homedir,tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

assert.equal(process.platform,'darwin');
assert.equal(process.arch,'arm64');
const previous=process.argv[2];
assert(previous,'Pass the preceding signed .app bundle.');
const {version}=JSON.parse(await readFile('package.json','utf8'));
const release=path.resolve('release/desktop');
const installation=path.join(await mkdtemp(path.join(tmpdir(),'hasimio-upgrade-')),'Hasimio.app');
execFileSync('ditto',[previous,installation]);
const bundleVersion=()=>execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(installation,'Contents/Info.plist')],{encoding:'utf8'}).trim();
const from=bundleVersion();
assert.notEqual(from,version);
function verifySignature(){
  execFileSync('codesign',['--verify','--deep','--strict',installation]);
  const result=spawnSync('codesign',['-d','-r-',installation],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const requirement=(result.stdout+'\n'+result.stderr).split(/\r?\n/).find(line=>line.startsWith('designated =>'));
  assert(requirement,'Missing designated signing requirement');
  return requirement;
}
const baselineRequirement=verifySignature();
const zip='Hasimio-'+version+'-mac-arm64.zip';
const allowed=new Set(['latest-mac.yml',zip]);
const port=18741;
const server=createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1);
  if(!allowed.has(name)){res.writeHead(404).end();return;}
  try{
    const file=path.join(release,name);
    res.writeHead(200,{'Content-Length':(await stat(file)).size,'Content-Type':name===zip?'application/zip':'text/yaml'});
    if(req.method==='HEAD')res.end();
    else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch{res.destroy();}
});
async function waitFor(description,check,timeout){
  const deadline=Date.now()+timeout;
  do{if(await check())return;await delay(500);}while(Date.now()<deadline);
  throw Error('Timed out waiting for '+description);
}
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
const log=path.join(homedir(),'Library/Logs/Hasimio/startup.log');
let browser,app;
try{
  const logStart=(await stat(log).catch(()=>({size:0}))).size;
  app=spawn(path.join(installation,'Contents/MacOS/Hasimio'),['--remote-debugging-address=127.0.0.1','--remote-debugging-port=18742'],{stdio:'inherit'});
  const endpoint='http://127.0.0.1:18742';
  await waitFor('the installed app to launch',async()=>{if(app.exitCode!==null)throw Error('Baseline app exited');return fetch(endpoint+'/json/version').then(r=>r.ok,()=>false);},60000);
  browser=await chromium.connectOverCDP(endpoint);
  let page;
  await waitFor('the Hasimio window',async()=>{
    for(const candidate of browser.contexts().flatMap(context=>context.pages())){
      if(await candidate.evaluate(()=>!!window.hasimioDesktop).catch(()=>false)){page=candidate;return true;}
    }
  },60000);
  assert.equal((await page.evaluate(()=>window.hasimioDesktop.getUpdate())).current,from);
  await page.evaluate(()=>window.hasimioDesktop.checkForUpdates());
  await waitFor('the signed candidate download',async()=>{
    const state=await page.evaluate(()=>window.hasimioDesktop.getUpdate());
    if(state.status==='error')throw Error(state.message);
    return state.status==='ready'&&state.version===version;
  },180000);
  // Installation terminates this renderer. Observe the replacement independently.
  await page.evaluate(()=>{void window.hasimioDesktop.installUpdate();});
  const expected='[hasimio] updated from '+from+' to '+version;
  await waitFor('the updated app to restart',async()=>{
    const fresh=(await readFile(log)).subarray(logStart).toString();
    return fresh.includes(expected);
  },120000);
  assert.equal(bundleVersion(),version);
  assert.equal(verifySignature(),baselineRequirement);
  console.log('Verified installed Mac upgrade from '+from+' to '+version);
}finally{
  await browser?.close().catch(()=>{});
  if(app&&app.exitCode===null)app.kill();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
