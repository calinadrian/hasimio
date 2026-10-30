// Exercise real Chromium image errors and React updates without relying on a CDN.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';

const require=createRequire(import.meta.url),folder=path.resolve('.cache/poster-smoke');
await mkdir(folder,{recursive:true});
await writeFile(path.join(folder,'fixture.tsx'),`
import React from 'react';
import {createRoot} from 'react-dom/client';
import Poster from '/src/Poster';
import '/src/styles.css';
const root=createRoot(document.getElementById('root'));
window.renderPosters=(items)=>root.render(<div className="poster-row wrap">{items.map(meta=><Poster key={meta.id} meta={meta} saved={false} onClick={()=>{}}/>)}</div>);
window.renderPosters([
  {id:'tt1',type:'series',name:'Missing cover'},
  {id:'tt2',type:'series',name:'Broken primary',poster:location.origin+'/broken.svg'},
  {id:'tt3',type:'series',name:'Working primary',poster:location.origin+'/good.svg'},
  {id:'tt4',type:'series',name:'Both sources fail',poster:location.origin+'/broken.svg'},
]);
`);
const vite=await createServer({configFile:false,plugins:[react(),{
  name:'poster-fixture',configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(req.url==='/good.svg'){
      res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#555"/><text x="30" y="225" fill="white" font-size="24">Cover fixture</text></svg>');
    }
    if(req.url==='/broken.svg'){res.statusCode=404;return res.end('Missing');}
    if(req.url==='/poster-test'){
      res.setHeader('Content-Type','text/html');return res.end(await server.transformIndexHtml('/poster-test','<html><head></head><body><div id="root"></div><script type="module" src="/.cache/poster-smoke/fixture.tsx"></script></body></html>'));
    }
    next();
  });}
}],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/.cache/**']}}});
await vite.listen();

async function run({url,folder}){
  const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
  app.setPath('userData',folder+'/profile');await app.whenReady();
  const win=new BrowserWindow({show:false,width:1280,height:850,webPreferences:{backgroundThrottling:false}});
  const requests=[];
  win.webContents.session.webRequest.onBeforeRequest({urls:['https://images.metahub.space/*']},(details,callback)=>{
    requests.push(details.url);callback({redirectURL:url+(details.url.includes('/tt4/')?'broken.svg':'good.svg')});
  });
  const js=source=>win.webContents.executeJavaScript(source,true);
  const wait=async source=>{for(let i=0;i<120;i++){if(await js(source))return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out: '+source);};
  try{
    await win.loadURL(url+'poster-test');
    await wait('document.querySelectorAll(".poster-card").length===4');
    await wait('[...document.querySelectorAll(".poster-card")].slice(0,3).every(card=>card.querySelector("img")?.naturalWidth>0)&&!document.querySelectorAll(".poster-card")[3].querySelector("img")');
    assert.ok(requests.some(url=>url.includes('/tt1/')));
    assert.ok(requests.some(url=>url.includes('/tt2/')));
    assert.ok(!requests.some(url=>url.includes('/tt3/')),'Healthy primary must not request backup');
    assert.equal(requests.filter(url=>url.includes('/tt4/')).length,1,'Exhausted sources must stop retrying');
    const painted=()=>js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await painted();
    await fs.writeFile(folder+'/desktop.png',(await win.webContents.capturePage()).toPNG());
    win.setContentSize(390,844);
    await painted();
    await fs.writeFile(folder+'/mobile.png',(await win.webContents.capturePage()).toPNG());
    await js(`window.renderPosters([{id:'tt4',type:'series',name:'New artwork',poster:location.origin+'/good.svg'}])`);
    await wait('document.querySelectorAll(".poster-card").length===1&&document.querySelector(".poster-card img")?.naturalWidth>0');
    console.log('PASS: Missing/broken covers recover; healthy primary retained; exhausted sources stop; updated metadata resets errors. Desktop/mobile captures saved.');
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
  assert.equal(code,0,'Poster smoke test failed');
}finally{await vite.close();}
