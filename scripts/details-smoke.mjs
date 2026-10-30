// Deliberately slow metadata must not block sources for known episodes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer as httpServer} from 'node:http';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const require=createRequire(import.meta.url),folder=path.resolve('.cache/details-smoke');
await mkdir(folder,{recursive:true});
const show={id:'perf:show',type:'series',name:'Slow metadata fixture',videos:[{id:'perf:show:1:1',season:1,episode:1},{id:'perf:show:1:2',season:1,episode:2}]};
let metadataRequests=0,streamRequests=0;
const service=httpServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','application/json');
  if(req.url==='/stats')return res.end(JSON.stringify({metadataRequests,streamRequests}));
  if(req.url.includes('/meta/')){metadataRequests++;return setTimeout(()=>res.end(JSON.stringify({meta:show})),2500);}
  if(req.url.includes('/stream/')){streamRequests++;return res.end(JSON.stringify({streams:[{name:'Fast fixture 1080p',url:'https://example.com/test.mp4'}]}));}
  res.end('{}');
});
service.listen(0,'127.0.0.1');await once(service,'listening');
const fixture=`http://127.0.0.1:${service.address().port}`;
const addon={url:fixture+'/manifest.json',enabled:true,manifest:{id:'perf',name:'Performance fixture',version:'1',resources:['meta','stream'],types:['series'],idPrefixes:['perf:'],catalogs:[]}};
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/.cache/**']}}});
await vite.listen();
async function run({url,fixture,show,addon,profile}){
  const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict');
  app.setPath('userData',profile);
  await app.whenReady();
  const win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{backgroundThrottling:false}});
  const js=s=>win.webContents.executeJavaScript(s,true);
  const wait=async s=>{for(let i=0;i<120;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+s);};
  const click=async s=>{await js(`(${s}).click()`);await new Promise(r=>setTimeout(r,50));};
  try{
    await win.loadURL(url);
    await js(`localStorage.clear();localStorage.setItem('hasimio:library',${JSON.stringify(JSON.stringify([{...show,metadataFetchedAt:1}]))});localStorage.setItem('hasimio:addons',${JSON.stringify(JSON.stringify([addon]))});`);
    await win.reload();
    await wait('!!document.querySelector(\'.nav-item[aria-label="Library"]\')');
    await click('document.querySelector(\'.nav-item[aria-label="Library"]\')');
    await wait('!!document.querySelector(".poster-card")');
    const start=Date.now();
    await click('document.querySelector(".poster-card")');
    await wait('!!document.querySelector(".detail-actions .primary:not(:disabled)")');
    const first=Date.now()-start;
    assert.ok(first<1500,`Sources took ${first}ms despite known episodes`);
    assert.ok(await js('[...document.querySelectorAll(".loading")].some(e=>e.textContent.includes("Loading details"))'),'Sources should appear while details are still loading');
    await click('document.querySelectorAll(".episode-select")[1]');
    await wait('document.querySelector(".detail-actions .primary").textContent.includes("E2")');
    await new Promise(r=>setTimeout(r,2700));
    assert.match(await js('document.querySelector(".detail-actions .primary").textContent'),/E2/,'Metadata must not reset the chosen episode');
    const stats=await (await fetch(fixture+'/stats')).json();
    assert.equal(stats.streamRequests,2,'Metadata completion must not repeat source searches');
    await click('document.querySelector(".close-dialog")');
    await click('document.querySelector(".poster-card")');
    await wait('!!document.querySelector(".episode-select")');
    assert.equal((await (await fetch(fixture+'/stats')).json()).metadataRequests,stats.metadataRequests,'Reopening must reuse fresh metadata');
    await click('document.querySelector(".close-dialog")');
    const preview={...show,videos:undefined,metadataFetchedAt:1};
    const history={'series:perf:show:1:1':{position:1,duration:1,updatedAt:Date.now(),completed:true,manual:true,titleKey:'series:perf:show',videoId:'perf:show:1:1'}};
    await js(`localStorage.setItem('hasimio:library',${JSON.stringify(JSON.stringify([preview]))});localStorage.setItem('hasimio:playback-progress:v1',${JSON.stringify(JSON.stringify(history))});window.dispatchEvent(new Event('hasimio:remote-data'));window.dispatchEvent(new Event('hasimio:playback-progress'));`);
    await click('document.querySelector(\'.nav-item[aria-label="Progress"]\')');
    await wait('!!document.querySelector(".progress-unknown")');
    assert.equal(await js('document.querySelectorAll(".progress-row-track").length'),0,'Unknown totals must not show zero-percent bars');
    await wait('document.querySelector(".progress-row-text small")?.textContent==="1 of 2 episodes watched"');
    assert.equal(await js('document.querySelector(".progress-row-track").getAttribute("aria-valuenow")'),'50');
    console.log(`PASS: Sources ready in ${first}ms with metadata delayed 2500ms; episode selection preserved; no repeated source/metadata requests.`);
    console.log('PASS: Progress displays unknown totals honestly and hydrates missing episode lists automatically.');
    await js(`localStorage.setItem('hasimio:library','[]');localStorage.removeItem('hasimio:progress-metadata:v1');`);
    await win.reload();
    await wait('!!document.querySelector(\'.nav-item[aria-label="Progress"]\')');
    await click('document.querySelector(\'.nav-item[aria-label="Progress"]\')');
    await wait('document.querySelector(".progress-row strong")?.textContent==="Slow metadata fixture"');
    assert.match(await js('document.querySelector(".progress-row-text small").textContent'),/1 of 2/);
    assert.equal(await js('JSON.parse(localStorage.getItem("hasimio:library")).length'),0,'Progress lookup must not add titles to the library');
    assert.ok(await js('JSON.parse(localStorage.getItem("hasimio:progress-metadata:v1")).some(m=>m.id==="perf:show")'),'Progress title metadata must survive reloads');
    console.log('PASS: Synced watch history hydrates and displays a title absent from library/catalogs, without changing library membership.');
    app.exit(0);
  }catch(error){console.error(error);console.error(await js('document.querySelector(".detail-dialog")?.textContent'));console.error(await(await fetch(fixture+'/stats')).json());app.exit(1);}
}
const runner=path.join(folder,'electron.cjs');
await writeFile(runner,`(${run.toString()})(${JSON.stringify({url:vite.resolvedUrls.local[0],fixture,show,addon,profile:path.join(folder,'profile')})})`);
try{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[runner],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  const watchdog=setTimeout(()=>child.kill(),30000);
  const [code]=await once(child,'exit');clearTimeout(watchdog);
  assert.equal(code,0,'Details performance smoke test failed');
}finally{await vite.close();service.closeAllConnections();await new Promise(resolve=>service.close(resolve));}
