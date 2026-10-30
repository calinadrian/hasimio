// Isolated UI coverage; no real account data or network lookups are needed.
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const require=createRequire(import.meta.url),folder=path.resolve('.cache/tvtime-import-smoke');
await mkdir(folder,{recursive:true});
const fixture=`key,series_name,s_id,season_number,episode_number,runtime,created_at\nwatch-episode-a,Import Example,123,1,1,2700,2024-01-01 10:00:00\nwatch-episode-b,Import Example,123,1,2,2700,2024-01-02 10:00:00\nwatch-episode-c,Unmatched Example,456,1,1,1200,2024-01-03 10:00:00\n`;
const entry=path.join(folder,'harness.tsx');
await writeFile(entry,`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Progress from '/src/Progress';import {playbackHistory} from '/src/playback-progress';import {zipCrc} from '/src/tvtime-import';import '/src/styles.css';import '/src/shell.css';
const realFetch=window.fetch;window.fetch=async(input,options)=>String(input).startsWith('https://api.tvmaze.com/')?String(input).endsWith('=123')?new Response(JSON.stringify({name:'Import Example',externals:{thetvdb:123,imdb:'tt123'}})):new Response('{}',{status:404}):realFetch(input,options);
const text=${JSON.stringify(fixture)},name='nested/tracking-prod-records-v2.csv',data=new TextEncoder().encode(text),n=new TextEncoder().encode(name),bytes=new Uint8Array(30+n.length+data.length+46+n.length+22),v=new DataView(bytes.buffer),c=30+n.length+data.length,e=c+46+n.length;
v.setUint32(0,0x04034b50,true);v.setUint32(14,zipCrc(data),true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);bytes.set(n,30);bytes.set(data,30+n.length);
v.setUint32(c,0x02014b50,true);v.setUint32(c+16,zipCrc(data),true);v.setUint32(c+20,data.length,true);v.setUint32(c+24,data.length,true);v.setUint16(c+28,n.length,true);bytes.set(n,c+46);
v.setUint32(e,0x06054b50,true);v.setUint16(e+8,1,true);v.setUint16(e+10,1,true);v.setUint32(e+12,46+n.length,true);v.setUint32(e+16,c,true);
window.chooseZip=()=>{const input=document.querySelector('input[type=file]'),dt=new DataTransfer();dt.items.add(new File([bytes],'tv-time-personal-data.zip',{type:'application/zip'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
function Harness(){const [version,setVersion]=useState(0),[titles,setTitles]=useState([]);return <main style={{padding:24,margin:0}}><Progress history={playbackHistory()} titles={titles} onOpen={()=>{}} onDiscover={()=>{}} onImported={(items,message)=>{setTitles(items);setVersion(version+1);window.importMessage=message;}}/></main>;}createRoot(document.getElementById('root')).render(<Harness/>);
`);
const vite=await createServer({configFile:false,plugins:[react(),{name:'tvtime-fixture',configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url!=='/tvtime-test')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/tvtime-test',`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/.cache/tvtime-import-smoke/harness.tsx"></script></body></html>`));});}}],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/.cache/**']}},logLevel:'error'});
await vite.listen();const url=vite.resolvedUrls.local[0],runner=path.join(folder,'electron.cjs');
await writeFile(runner,`
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises');app.setPath('userData',${JSON.stringify(path.join(folder,'profile'))});
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{backgroundThrottling:false}}),js=s=>win.webContents.executeJavaScript(s,true),wait=async s=>{for(let i=0;i<100;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+s);};
try{
await win.loadURL(${JSON.stringify(url+'tvtime-test')});await wait('!!window.chooseZip');await js('localStorage.clear();localStorage.setItem("hasimio:playback-progress:v1",JSON.stringify({"series:tt123:1:1":{position:100,duration:2700,updatedAt:99,completed:false,titleKey:"series:tt123",videoId:"tt123:1:1"}}));window.chooseZip()');
await wait('document.body.textContent.includes("1 watched episode")');assert(await js('document.body.textContent.includes("1 show needs a match")'));
await js('document.querySelector(".tvtime-preview details").open=true');await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(${JSON.stringify(path.join(folder,'preview-desktop.png'))},(await win.webContents.capturePage()).toPNG());
win.setContentSize(390,844);await new Promise(r=>setTimeout(r,100));assert(await js('document.documentElement.scrollWidth<=window.innerWidth'));await fs.writeFile(${JSON.stringify(path.join(folder,'preview-mobile.png'))},(await win.webContents.capturePage()).toPNG());
await js('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Import watched progress")).click()');await wait('!!window.importMessage');
const history=await js('JSON.parse(localStorage.getItem("hasimio:playback-progress:v1"))');assert.equal(history['series:tt123:1:1'].position,100);assert.equal(history['series:tt123:1:1'].completed,false);assert.equal(history['series:tt123:1:2'].completed,true);assert.equal(Object.keys(history).length,2);
await js('window.chooseZip()');await wait('document.body.textContent.includes("0 watched episodes")');assert(await js('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Import watched progress")).disabled'));
console.log('TV Time import UI passed: preview, unresolved matches, mobile layout, merge preservation and repeated imports.');app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
try{const child=spawn(require('electron'),[runner],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);const [code]=await once(child,'exit');if(code)process.exitCode=code;}finally{await vite.close();}
