// Exercise the actual React player in Electron against a growing, generated movie.
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer as createViteServer} from 'vite';
import ffmpeg from 'ffmpeg-static';

const require=createRequire(import.meta.url);
const folder=path.resolve('.cache/player-smoke');
await mkdir(folder,{recursive:true});
await promisify(execFile)(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','40','-c:v','libx264','-preset','ultrafast','-g','24','-pix_fmt','yuv420p','-c:a','aac','-f','hls','-hls_segment_type','fmp4','-hls_time','2','-hls_list_size','0','-hls_playlist_type','event',path.join(folder,'movie.m3u8')],{cwd:folder,windowsHide:true});
const playlist=await readFile(path.join(folder,'movie.m3u8'),'utf8');
let segmentCount=8;
const media=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','no-store');
  const name=path.basename(new URL(req.url,'http://localhost').pathname);
  if(name==='movie.m3u8'){
    // Keep it an unfinished EVENT playlist, even though the fixture is ready on disk.
    const lines=playlist.split('\n'),first=lines.findIndex(line=>line.startsWith('#EXTINF'));
    res.setHeader('Content-Type','application/vnd.apple.mpegurl');
    return res.end(lines.slice(0,first+segmentCount*2).join('\n')+'\n');
  }
  if(/^captions-(eng|spa)\.vtt$/.test(name)){
    res.setHeader('Content-Type','text/vtt');
    return res.end('WEBVTT\n\n00:00.100 --> 00:39.000\n'+(name.includes('spa')?'Spanish subtitle':'English subtitle')+'\n');
  }
  if(name==='grow'){segmentCount=20;return res.end('ok');}
  if(!/^(?:init\.mp4|movie\d+\.m4s)$/.test(name)){res.writeHead(404);return res.end();}
  try{res.end(await readFile(path.join(folder,name)));}catch{res.writeHead(404);res.end();}
});
let vite;
try{
  media.listen(0,'127.0.0.1');await once(media,'listening');
  const source=`http://127.0.0.1:${media.address().port}`;
  await writeFile(path.join(folder,'index.html'),'<html><body style="margin:0"><div id="root"></div><script type="module" src="./fixture.tsx"></script></body></html>');
  await writeFile(path.join(folder,'fixture.tsx'),`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import Player from '/src/Player';import '/src/styles.css';
    function Fixture(){const [sub,setSub]=useState(true),[language,setLanguage]=useState('eng');return <><button id="switch-sub" onClick={()=>setLanguage(v=>v==='eng'?'spa':'eng')}>Switch language</button><button id="toggle-sub" onClick={()=>setSub(v=>!v)}>Toggle test subtitle</button><Player title="Generated movie" preparedStream durationHint={40} onClose={()=>{}} stream={{url:'${source}/movie.m3u8',subtitleTrack:sub?{url:'${source}/captions-'+language+'.vtt',label:'Test',language}:undefined}}/></>;}createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  vite=await createViteServer({server:{host:'127.0.0.1',port:0,strictPort:false}});
  await vite.listen();
  const url=`http://127.0.0.1:${vite.httpServer.address().port}/.cache/player-smoke/index.html`;
  const runner=path.join(folder,'electron.cjs');
  await writeFile(runner,`
    const {app,BrowserWindow}=require('electron');const assert=require('node:assert/strict');
    app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1280,height:820,webPreferences:{backgroundThrottling:false}});
      win.webContents.on('console-message',event=>{if(event.level==='warning'||event.level==='error')console.error(event.message);});
      const js=s=>win.webContents.executeJavaScript(s);
      async function until(s){for(let i=0;i<100;i++){if(await js(s))return;await sleep(100);}throw Error('Timed out: '+s);}
      try{
        await win.loadURL(${JSON.stringify(url)});
        await until('document.querySelector("video")?.currentTime>0.2');
        const start=await js('document.querySelector("video").currentTime');assert.ok(start<3,'Prepared movie must start at zero, got '+start);
        assert.equal(await js('Number(document.querySelector("input[type=range]").max)'),40);
        await until('document.querySelector("video").textTracks[0]?.activeCues?.length===1');
        await js('document.querySelector("video").pause()');
        const paused=await js('document.querySelector("video").currentTime');
        await js('fetch(${JSON.stringify(source+'/grow')})');await sleep(4500);
        assert.ok(Math.abs((await js('document.querySelector("video").currentTime'))-paused)<0.2,'Growing playlist must not move a paused playhead');
        assert.equal(await js('Number(document.querySelector("input[type=range]").max)'),40);
        await until('document.querySelector("video").seekable.end(0)>25');
        // Native mouse input tests the range control and React handlers together.
        const box=await js('(()=>{const r=document.querySelector("input[type=range]").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
        await js('window.seekEvents=0;document.querySelector("video").addEventListener("seeking",()=>window.seekEvents++)');
        const point=f=>({x:Math.round(box.x+box.w*f),y:Math.round(box.y+box.h/2)});
        win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point(.25)});
        for(const f of [.3,.4,.5,.6]){win.webContents.sendInputEvent({type:'mouseMove',button:'left',modifiers:['leftButtonDown'],...point(f)});await sleep(60);}
        assert.ok(Math.abs((await js('document.querySelector("video").currentTime'))-paused)<0.2,'Dragging must preview without repeatedly seeking');
        win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point(.6)});
        await until('document.querySelector("video").currentTime>22');
        await until('window.seekEvents===1&&!document.querySelector("video").seeking');
        assert.equal(await js('window.seekEvents'),1,'Releasing a drag should seek once');
        await js('document.getElementById("toggle-sub").click()');await until('document.querySelector("video").textTracks[0].mode==="disabled"');
        assert.equal(await js('document.querySelector("video").textTracks[0].cues?.length||0'),0);
        await js('document.getElementById("toggle-sub").click()');await until('document.querySelector("video").textTracks[0].activeCues?.length===1');
        for(let i=0;i<6;i++){
          await js('document.getElementById("switch-sub").click()');await sleep(150);
          const expected=i%2===0?'Spanish subtitle':'English subtitle';
          await until('Array.from(document.querySelector("video").textTracks[0].cues||[]).some(c=>c.text==='+JSON.stringify(expected)+')');
          const cues=await js('Array.from(document.querySelector("video").textTracks).filter(t=>t.mode==="showing").flatMap(t=>Array.from(t.cues||[]).map(c=>c.text))');
          assert.deepEqual(cues,[expected],'Switching language must replace all previous cues');
        }
        await js('document.querySelector(".cinema-player").focus()');
        win.webContents.sendInputEvent({type:'keyDown',keyCode:'Left'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Left'});
        await until('document.querySelector("video").currentTime<16');
        await js('document.querySelector("video").play()');await sleep(1500);
        await until('document.querySelector(".cinema-time").textContent.startsWith("0:1")');
        await until('document.querySelector(".cinema-play").getAttribute("aria-label")==="Pause video"');
        const resumed=await js('document.querySelector("video").currentTime');assert.ok(resumed>13&&resumed<18,'Resume must keep the requested position, got '+resumed);
        require('node:fs').writeFileSync(${JSON.stringify(path.join(folder,'player.png'))},(await win.webContents.capturePage()).toPNG());
        console.log('PASS: Electron playback starts at zero, keeps a stable full timeline, preserves pause as the playlist grows, commits one seek per drag, supports keyboard seeking, displays/toggles the newest subtitle, and replaces all old cues across repeated English/Spanish switches.');
        app.exit(0);
      }catch(error){console.error(error);console.error(await js('JSON.stringify({body:document.body.innerText,video:(()=>{const v=document.querySelector("video");return v?{src:v.currentSrc,ready:v.readyState,paused:v.paused,time:v.currentTime,error:v.error?.message}:null})()})'));app.exit(1);}
    });
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[runner],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  const watchdog=setTimeout(()=>child.kill(),45000);
  const [code]=await once(child,'exit');clearTimeout(watchdog);
  assert.equal(code,0,'Electron player smoke test failed');
}finally{await vite?.close();media.closeAllConnections();await new Promise(resolve=>media.close(resolve));}
