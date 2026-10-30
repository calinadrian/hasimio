// Check Progress with a large library in an isolated Chromium window.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';

const require=createRequire(import.meta.url),folder=path.resolve('.cache/progress-library-smoke');
await mkdir(folder,{recursive:true});
await writeFile(path.join(folder,'fixture.tsx'),`
import React from 'react';
import {createRoot} from 'react-dom/client';
import Progress from '/src/Progress';
import '/src/styles.css';
const root=createRoot(document.getElementById('root'));
const shows=['Breaking Bad','The Walking Dead','Sugar','All Her Fault','Ted','Griselda','The Last of Us','Severance'];
const titles=Array.from({length:120},(_,i)=>({id:'fixture:series'+i,type:'series',category:i%5===0?'anime':undefined,name:shows[i%8]+' · Fixture '+String(i+1).padStart(3,'0'),runtime:'45 min',videos:Array.from({length:12},(_,n)=>({id:'fixture:series'+i+':'+n,season:1,episode:n+1}))}));
titles.push(...Array.from({length:40},(_,i)=>({id:'fixture:movie'+i,type:'movie',name:'Cinema fixture '+String(i+1).padStart(2,'0'),runtime:'120 min',releaseInfo:'2025'})));
const history={};
titles.forEach((meta,i)=>{
  const movie=meta.type==='movie',count=movie?1:i%4===0?12:3;
  for(let n=0;n<count;n++){
    const videoId=movie?meta.id:meta.videos[n].id;
    history[meta.type+':'+videoId]={position:1,duration:1,completed:true,manual:true,titleKey:meta.type+':'+meta.id,videoId,updatedAt:Date.now()-i*60000};
  }
});
window.renderProgress=(small=false)=>root.render(<main style={{margin:0,padding:'24px',width:'100%',boxSizing:'border-box'}}><Progress history={history} titles={small?titles.slice(0,2):titles} onOpen={meta=>{window.openedTitle=meta.id;}} onDiscover={()=>{}} onRefresh={()=>{}}/></main>);
window.renderProgress();
`);
const vite=await createServer({configFile:false,plugins:[react(),{
  name:'progress-library-fixture',configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(req.url!=='/progress-test')return next();
    res.setHeader('Content-Type','text/html');
    res.end(await server.transformIndexHtml('/progress-test','<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/.cache/progress-library-smoke/fixture.tsx"></script></body></html>'));
  });}
}],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/.cache/**']}}});
await vite.listen();
async function run({url,folder}){
  const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
  app.setPath('userData',folder+'/profile');await app.whenReady();
  const win=new BrowserWindow({show:false,width:1280,height:960,webPreferences:{backgroundThrottling:false}});
  const js=source=>win.webContents.executeJavaScript(source,true);
  const wait=async source=>{for(let i=0;i<100;i++){if(await js(source))return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('Timed out: '+source);};
  const click=async selector=>{await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
  const search=async text=>{await js(`(()=>{const input=document.querySelector('[aria-label="Search tracked titles"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
  const painted=()=>js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  try{
    await win.loadURL(url+'progress-test');
    await wait('document.querySelectorAll(".progress-row").length===8');
    assert.equal(await js('document.querySelectorAll(".progress-movie").length'),6);
    assert.equal(await js('document.querySelector(".progress-activity").open'),false);
    assert.match(await js('document.querySelector(".count-label").textContent'),/160 titles/);
    await click('[aria-label="Next series page"]');
    assert.match(await js('document.querySelector(".progress-row strong").textContent'),/012/);
    await click('[aria-label="Next movies page"]');
    assert.match(await js('document.querySelector(".progress-movie strong").textContent'),/07/);
    await search('Fixture 120');
    await wait('document.querySelectorAll(".progress-row").length===1');
    assert.match(await js('document.querySelector(".progress-row strong").textContent'),/120/);
    await click('.progress-row');
    assert.equal(await js('window.openedTitle'),'fixture:series119');
    assert.equal(await js('document.querySelectorAll(".progress-pagination").length'),0,'Search must reset pagination');
    await search('no such title');
    await wait('document.querySelectorAll(".progress-row").length===0');
    assert.match(await js('document.querySelector(".progress-filter-empty h3").textContent'),/No matching series/);
    await click('[aria-label="Clear title search"]');
    await click('.progress-filters button:nth-child(3)');
    assert.match(await js('document.querySelector(".progress-pagination").textContent'),/of 24 series/);
    await click('.progress-categories button:nth-child(2)');
    assert.equal(await js('document.querySelector(".progress-filters button:nth-child(3) span").textContent'),'6');
    await click('.progress-filters button:nth-child(1)');
    assert.match(await js('document.querySelector(".progress-pagination").textContent'),/of 24 series/);
    await click('.progress-categories button:nth-child(1)');
    await click('.progress-filters button:nth-child(1)');
    await js(`(()=>{const select=document.querySelector('[aria-label="Sort series"]');select.value='name';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await painted();
    assert.match(await js('document.querySelector(".progress-row strong").textContent'),/^All Her Fault/);
    await painted();await fs.writeFile(folder+'/desktop.png',(await win.webContents.capturePage()).toPNG());
    win.setContentSize(2560,1350);await painted();
    assert.equal(await js('(()=>{const rows=document.querySelectorAll(".progress-row");return Math.abs(rows[0].getBoundingClientRect().top-rows[1].getBoundingClientRect().top)<2})()'),true,'Wide lists should use two compact columns');
    assert.equal(await js('(()=>{const row=document.querySelector(".progress-row");return row.querySelector(".progress-row-state").getBoundingClientRect().left-row.querySelector(".progress-row-track").getBoundingClientRect().right<180})()'),true,'Status should stay close to its progress bar');
    await fs.writeFile(folder+'/wide.png',(await win.webContents.capturePage({x:0,y:0,width:1490,height:1250})).toPNG());
    await click('.progress-activity summary');
    assert.equal(await js('document.querySelector(".progress-activity").open'),true);
    win.setContentSize(390,844);await painted();
    assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true,'Mobile must not overflow');
    await fs.writeFile(folder+'/mobile.png',(await win.webContents.capturePage()).toPNG());
    await click('[aria-label="Next series page"]');
    await js('window.renderProgress(true)');
    await wait('document.querySelectorAll(".progress-row").length===1');
    assert.equal(await js('document.querySelectorAll(".progress-pagination").length'),0,'Shrinking data must clamp the page');
    console.log('PASS: 160 tracked titles; bounded rows, independent pagination, search/reset, status filters, sorting, title opening, collapsed activity, shrinking data and mobile overflow.');
    app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
}
const runner=path.join(folder,'electron.cjs');
await writeFile(runner,`(${run.toString()})(${JSON.stringify({url:vite.resolvedUrls.local[0],folder})})`);
try{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[runner],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  const watchdog=setTimeout(()=>child.kill(),30000);
  const [code]=await once(child,'exit');clearTimeout(watchdog);
  assert.equal(code,0,'Progress library smoke test failed');
}finally{await vite.close();}
