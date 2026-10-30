import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const require=createRequire(import.meta.url),folder=path.resolve('.cache/people-smoke');await mkdir(folder,{recursive:true});
const person={id:'nm1',name:'Bryan Cranston',titles:24};
const vite=await createServer({configFile:false,plugins:[react(),{name:'people-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{
  if(!req.url.startsWith('/api/people/'))return next();
  res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://fixture');
  if(url.pathname.includes('/cast'))return res.end(JSON.stringify({cast:[{...person,role:'Walter White'},{id:'nm2',name:'Aaron Paul',role:'Jesse Pinkman'}]}));
  if(url.pathname.endsWith('/search'))return res.end(JSON.stringify({people:[person]}));
  const type=url.searchParams.get('type')||'movie';
  res.end(JSON.stringify({person,metas:Array.from({length:12},(_,i)=>({id:'tt'+(100+i),name:'Actor credit fixture '+(i+1),type,releaseInfo:'2025'})),hasMore:false}));
});}}],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/.cache/**']}}});await vite.listen();
async function run({url,folder}){
  const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises');app.setPath('userData',folder+'/profile');await app.whenReady();
  const win=new BrowserWindow({show:false,width:1280,height:960,webPreferences:{backgroundThrottling:false}}),js=s=>win.webContents.executeJavaScript(s,true);
  const wait=async s=>{for(let i=0;i<160;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out: '+s);};
  const click=async s=>{await js(`(${s}).click()`);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');};
  try{
    await win.loadURL(url);
    await js(`localStorage.clear();localStorage.setItem('hasimio:library',JSON.stringify([{id:'tt0903747',type:'series',name:'Breaking Bad',metadataFetchedAt:Date.now(),videos:[{id:'tt0903747:1:1',season:1,episode:1}]}]));`);
    await win.reload();await wait('!!document.querySelector(\'.nav-item[aria-label="Library"]\')');
    await click('document.querySelector(\'.nav-item[aria-label="Library"]\')');await wait('!!document.querySelector(".poster-card")');
    await click('document.querySelector(".poster-card")');await wait('document.querySelectorAll(".person-button").length===2');
    assert.match(await js('document.querySelector(".people-section").textContent'),/Walter White/);
    await fs.writeFile(folder+'/cast.png',(await win.webContents.capturePage()).toPNG());
    await click('document.querySelector(".person-button")');await wait('document.querySelector(".actor-page h1")?.textContent==="Bryan Cranston"');
    await wait('document.querySelectorAll(".actor-page .poster-card").length===12');
    assert.equal(await js('document.querySelector("dialog").open'),false);
    await js('(()=>{const select=document.querySelector(\'[aria-label="Filter actor titles"]\');select.value="series";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await wait('document.querySelector(".actor-page .poster-card>span")?.textContent.includes("Series")');
    await fs.writeFile(folder+'/actor.png',(await win.webContents.capturePage()).toPNG());
    await js('(()=>{const input=document.querySelector(".search input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"Bryan Cranston");input.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await wait('!!document.querySelector(\'[aria-label="Actor search"] .person-button\')');
    await click('document.querySelector(\'[aria-label="Actor search"] .person-button\')');await wait('!!document.querySelector(".actor-page")');
    win.setContentSize(390,844);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);
    await fs.writeFile(folder+'/mobile.png',(await win.webContents.capturePage()).toPNG());
    console.log('PASS: Cast roles, cast-to-actor navigation, actor filmography, movie/series filtering, global actor-name search and mobile layout.');app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
}
const runner=path.join(folder,'electron.cjs');await writeFile(runner,`(${run.toString()})(${JSON.stringify({url:vite.resolvedUrls.local[0],folder})})`);
try{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(require('electron'),[runner],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);const timer=setTimeout(()=>child.kill(),40000);const [code]=await once(child,'exit');clearTimeout(timer);assert.equal(code,0);}finally{await vite.close();}
