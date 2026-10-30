import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const require=createRequire(import.meta.url),folder=path.resolve('.cache/discover-smoke');
await mkdir(folder,{recursive:true});
let requests=0,failNext=true;
const vite=await createServer({configFile:false,plugins:[react(),{
  name:'discover-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{
    if(!req.url.startsWith('/fixture/'))return next();
    if(req.url==='/fixture/poster.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#444"/><text x="30" y="220" fill="white" font-size="28">Test artwork</text></svg>');}
    const skip=Number(/skip=(\d+)/.exec(req.url)?.[1]??0);
    if(req.url.includes('/catalog/')){
      requests++;
      if(skip&&failNext){failNext=false;res.statusCode=503;return res.end('{}');}
      res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({metas:Array.from({length:12},(_,i)=>({id:'open:fixture'+(i+skip),type:'movie',name:'Discover fixture '+(i+skip+1),poster:'http://'+req.headers.host+'/fixture/poster.svg',releaseInfo:'2026',metadataFetchedAt:Date.now()})),hasMore:skip===0}));
    }
    res.end('{}');
  });}
}],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/.cache/**']}}});
await vite.listen();const url=vite.resolvedUrls.local[0];
async function run({url,folder}){
  const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
  app.setPath('userData',folder+'/profile');await app.whenReady();
  const win=new BrowserWindow({show:false,width:1280,height:960,webPreferences:{backgroundThrottling:false}});
  const js=s=>win.webContents.executeJavaScript(s,true);
  const wait=async s=>{for(let i=0;i<180;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out: '+s);};
  const click=async s=>{await js(`(${s}).click()`);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');};
  try{
    await win.loadURL(url);
    const addon={url:url+'fixture/manifest.json',enabled:true,manifest:{id:'fixture.discover',name:'Browse fixture',version:'1',resources:['catalog'],types:['movie'],catalogs:[{id:'popular',type:'movie',name:'Popular movies',extra:[{name:'skip'}]}]}};
    await js(`localStorage.clear();localStorage.setItem('hasimio:addons',${JSON.stringify(JSON.stringify([addon]))});`);
    await win.reload();
    await wait('document.querySelectorAll(".media-shelf .poster-card").length>=12');
    assert.equal(await js('document.querySelectorAll(".load-more").length'),0);
    await click('document.querySelector(".shelf-heading-button")');
    await wait('!!document.querySelector(".shelf-back")');
    assert.equal(await js('!!document.querySelector(".media-shelf .poster-row.wrap")'),true,'Clickable shelf opens a collection grid');
    await js('document.querySelector(".media-shelf .poster-row").lastElementChild.scrollIntoView({block:"end"})');
    await js('document.querySelector(".media-shelf").scrollIntoView({block:"start"});document.querySelector(".media-shelf .poster-row").scrollLeft=100000');
    await wait('!!document.querySelector(".shelf-retry")');
    await click('document.querySelector(".shelf-retry")');
    await wait('document.querySelector(".media-shelf .poster-row").children.length===24');
    await click('document.querySelector(".shelf-back")');
    await wait('!document.querySelector(".shelf-back")');
    await js('document.querySelector(".media-shelf .poster-row").scrollLeft=0');
    await click('document.querySelector(".media-shelf .poster-card")');
    await wait('document.querySelector(".detail-title h2")?.textContent==="Discover fixture 1"');
    await click('document.querySelector(\'[aria-label="Next title"]\')');
    await wait('document.querySelector(".detail-title h2")?.textContent==="Discover fixture 2"');
    await click('document.querySelector(\'[aria-label="Previous title"]\')');
    await wait('document.querySelector(".detail-title h2")?.textContent==="Discover fixture 1"');
    assert.equal(await js('document.querySelector(\'[aria-label="Previous title"]\').disabled'),true);
    await click('document.querySelector(".close-dialog")');
    await js('document.querySelector(".media-shelf .poster-row").scrollLeft=500');
    const before=await js('document.querySelector(".media-shelf .poster-row").scrollLeft');
    await click('document.querySelector(".media-shelf .poster-card:nth-child(5)")');
    await click('document.querySelector(".close-dialog")');
    assert.equal(await js('document.querySelector(".media-shelf .poster-row").scrollLeft'),before);
    await fs.writeFile(folder+'/desktop.png',(await win.webContents.capturePage()).toPNG());
    win.setContentSize(390,844);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);
    await fs.writeFile(folder+'/mobile.png',(await win.webContents.capturePage()).toPNG());
    console.log('PASS: Shelf pagination, visible retry after failure, no Load more, previous/next title details, boundary state, preserved scroll and mobile overflow.');
    app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
}
const runner=path.join(folder,'electron.cjs');
await writeFile(runner,`(${run.toString()})(${JSON.stringify({url,folder})})`);
try{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[runner],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  const timer=setTimeout(()=>child.kill(),40000);const [code]=await once(child,'exit');clearTimeout(timer);assert.equal(code,0);
  assert.equal(requests,3,'One initial page, one failed page, one retry');
}finally{await vite.close();}
