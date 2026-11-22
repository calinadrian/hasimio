// Exercise the actual React player in Electron against a growing, generated movie.
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
import ffmpeg from 'ffmpeg-static';
import {strToU8,zipSync} from 'fflate';

const require=createRequire(import.meta.url);
const folder=path.resolve('.cache/player-smoke');
const nativePointer=process.argv.includes('--native-pointer');
await mkdir(folder,{recursive:true});
// A fresh profile each run: saved settings (automatic subtitles off, another language) change what the player shows.
await rm(path.join(folder,'profile'),{recursive:true,force:true});

// Online subtitles go through the real engine routes and site parsers; only the websites are stand-ins.
// OpenSubtitles has English only (as it often does for Romanian), Subtitrari-noi.ro cannot be reached,
// subs.ro's closest version is rate-limited, and YIFY Subtitles answers.
process.env.HASIMIO_CACHE_DIR=path.join(folder,'engine-cache');
const {createMediaService}=await import('../server/service.mjs');
const onlineFile='The.Shawshank.Redemption.1994.720p.BluRay.x264-YIFY.mp4',yifySlug='the-shawshank-redemption-1994-romanian-yify-77',siteRequests=[];
async function subtitleSites(url,options={}){
  url=String(url);siteRequests.push(url);
  const reply=(body,{status=200,type='text/html'}={})=>new Response(body,{status,headers:{'content-type':type}});
  if(url==='https://opensubtitles-v3.strem.io/subtitles/movie/tt0111161.json')return reply(JSON.stringify({subtitles:[{url:'https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/101',lang:'eng',subtitleFileName:onlineFile.replace('.mp4','.srt')}]}),{type:'application/json'});
  if(url.startsWith('https://www.subtitrari-noi.ro/'))throw new TypeError('fetch failed');
  if(url==='https://subs.ro/subtitrari/imdbid/0111161')return reply('<div class="group" data-subtitle-result="true" data-subtitle-id="501" data-imdb-id="0111161" data-language="ro"><h3 data-field="title"><a href="https://subs.ro/subtitrare/the-shawshank-redemption/501" class="link" title="Subtitrare The Shawshank Redemption 1994 720p BluRay x264-YIFY">The Shawshank Redemption</a></h3><div data-field="comment-text">720p BluRay</div></div>');
  if(url==='https://subs.ro/subtitrare/descarca/subtitrare/501')return reply('',{status:429});
  if(url==='https://yifysubtitles.ch/movie-imdb/tt0111161')return reply(`<table><tr data-id="1"><td><span class="label">3</span></td><td><span class="sub-lang">Romanian</span></td><td><a href="/subtitles/${yifySlug}"><span class="text-muted">subtitle</span> The Shawshank Redemption</a></td></tr></table>`);
  if(url===`https://yifysubtitles.ch/subtitle/${yifySlug}.zip`&&options.headers?.Referer===`https://yifysubtitles.ch/subtitles/${yifySlug}`)return reply(zipSync({'Shawshank.RO.srt':strToU8('1\n00:00:00,500 --> 00:00:39,000\nSalut din YIFY\n')}),{type:'application/zip'});
  return reply('',{status:404});
}
const engine=createMediaService({fetchImpl:subtitleSites,titles:{close:async()=>{}},allowedOrigins:new Set(),pieceCache:0});
const cursorScript=path.join(folder,'cursor.ps1');
if(nativePointer)await writeFile(cursorScript,`param([int]$x,[int]$y)
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class PlayerCursor { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); }'
[PlayerCursor]::SetCursorPos($x,$y) | Out-Null
`);
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
    if(new URL(req.url,'http://localhost').searchParams.has('changing')){
      const stamp=seconds=>'00:'+String(Math.floor(seconds/60)).padStart(2,'0')+':'+(seconds%60).toFixed(3).padStart(6,'0');
      return res.end('WEBVTT\n\n'+Array.from({length:120},(_,i)=>stamp(i/3)+' --> '+stamp((i+1)/3)+'\n'+(i%2?'Short subtitle':'A longer subtitle line\nWith another line\nAnd a third line')+'\n\n').join(''));
    }
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
  // Like TorrentPlayer, the fixture passes a subtitle selection, so the attached track shows in any language.
  await writeFile(path.join(folder,'fixture.tsx'),`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import Player from '/src/Player';import {useSubtitleSelection} from '/src/subtitle-selection';import '/src/styles.css';
    function Fixture(){const selection=useSubtitleSelection(),[sub,setSub]=useState(true),[language,setLanguage]=useState('eng'),[changing,setChanging]=useState(false);return <dialog className="detail-dialog playback-dialog" ref={node=>{if(node&&!node.open)node.showModal();}}><button id="changing-sub" onClick={()=>setChanging(true)}>Changing subtitles</button><button id="switch-sub" onClick={()=>setLanguage(v=>v==='eng'?'spa':'eng')}>Switch language</button><button id="toggle-sub" onClick={()=>setSub(v=>!v)}>Toggle test subtitle</button><Player title="Generated movie" preparedStream durationHint={40} onClose={()=>{}} subtitleSelection={selection} stream={{url:'${source}/movie.m3u8',subtitleTrack:sub?{url:'${source}/captions-'+language+'.vtt'+(changing?'?changing=1':''),label:'Test',language}:undefined}}/></dialog>;}createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  // A movie with no subtitles of its own while Romanian is wanted: the player looks online by itself.
  await writeFile(path.join(folder,'online.html'),'<html><body style="margin:0"><div id="root"></div><script type="module" src="./online.tsx"></script></body></html>');
  await writeFile(path.join(folder,'online.tsx'),`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import Player from '/src/Player';import '/src/styles.css';
    createRoot(document.getElementById('root')).render(<dialog className="detail-dialog playback-dialog" ref={node=>{if(node&&!node.open)node.showModal();}}><Player title="Online subtitles movie" videoId="tt0111161" preparedStream durationHint={40} onClose={()=>{}} stream={{url:'${source}/movie.m3u8',filename:${JSON.stringify(onlineFile)}}}/></dialog>);
  `);
  const engineRoutes={name:'hasimio-engine-subtitles',configureServer(server){server.middlewares.use((req,res,next)=>req.url?.startsWith('/api/subtitles/')?engine.handle(req,res,next):next());}};
  vite=await createViteServer({configFile:false,plugins:[react(),engineRoutes],server:{host:'127.0.0.1',port:0,strictPort:false,watch:{ignored:['**/.cache/player-smoke/profile/**','**/.cache/player-smoke/engine-cache/**']}}});
  await vite.listen();
  const url=`http://127.0.0.1:${vite.httpServer.address().port}/.cache/player-smoke/index.html`;
  const onlineUrl=`http://127.0.0.1:${vite.httpServer.address().port}/.cache/player-smoke/online.html`;
  const runner=path.join(folder,'electron.cjs');
  await writeFile(runner,`
    const {app,BrowserWindow,screen}=require('electron');const assert=require('node:assert/strict');
    app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
    app.setPath('userData',${JSON.stringify(path.join(folder,'profile'))});
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1280,height:820,webPreferences:{backgroundThrottling:false,preload:${JSON.stringify(path.resolve('electron/preload.cjs'))}}});
      let cursor={x:0,y:0},pointerMessages=0;
      const {watchPointerActivity}=await import(${JSON.stringify(new URL('../electron/player-activity.mjs',import.meta.url).href)});
      const nativePointer=${nativePointer},originalCursor=screen.getCursorScreenPoint();
      const moveCursor=async point=>{if(nativePointer)await require('node:util').promisify(require('node:child_process').execFile)('powershell.exe',['-NoProfile','-File',${JSON.stringify(cursorScript)},String(point.x),String(point.y)],{windowsHide:true});else cursor=point;};
      const actualFocus=win.isFocused.bind(win);
      watchPointerActivity(win,nativePointer?screen:{getCursorScreenPoint:()=>({...cursor})});
      const send=win.webContents.send.bind(win.webContents);win.webContents.send=(channel,...args)=>{if(channel==='hasimio:player-pointer')pointerMessages++;return send(channel,...args);};
      console.log('Pointer watcher started, focused='+actualFocus());
      win.webContents.on('console-message',event=>{if(event.level==='warning'||event.level==='error')console.error(event.message);});
      const js=s=>win.webContents.executeJavaScript(s,true);
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
          const cues=await js('Array.from(document.querySelector("video").textTracks).filter(t=>t.mode==="hidden").flatMap(t=>Array.from(t.cues||[]).map(c=>c.text))');
          assert.deepEqual(cues,[expected],'Switching language must replace all previous cues');
          await until('document.querySelector(".cinema-caption")?.textContent==='+JSON.stringify(expected));
        }
        await js('document.querySelector(".cinema-player").focus()');
        win.webContents.sendInputEvent({type:'keyDown',keyCode:'Left'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Left'});
        await until('document.querySelector("video").currentTime<16');
        await js('document.querySelector("video").play()');await sleep(1500);
        await until('document.querySelector(".cinema-time").textContent.startsWith("0:1")');
        await until('document.querySelector(".cinema-play").getAttribute("aria-label")==="Pause video"');
        const resumed=await js('document.querySelector("video").currentTime');assert.ok(resumed>13&&resumed<18,'Resume must keep the requested position, got '+resumed);
        await js('Array.from(document.querySelectorAll("button")).find(button=>button.getAttribute("aria-label")==="Enter fullscreen").focus()');
        for(const paused of [true,false]){
          win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
          await until('document.querySelector("video").paused==='+paused);
          assert.equal(await js('!!document.fullscreenElement'),false,'Space should leave fullscreen unchanged while its button is focused');
        }
        await js('document.querySelector(".cinema-player").focus()');
        console.log('PASS: Space pauses and resumes with the Fullscreen button focused.');
        // Match the app's modal dialog and repeat fullscreen wake/hide cycles.
        await js('document.getElementById("changing-sub").click()');
        await until('document.querySelector(".cinema-caption")?.textContent.includes("subtitle")');
        if(nativePointer){win.show();win.focus();await sleep(500);}
        // The OS watcher must work outside fullscreen too, where Chromium can stop
        // reporting mousemove while the window is unfocused.
        // A real cursor on a busy machine can move on its own, so still-cursor checks
        // only run with the deterministic fake pointer.
        if(!nativePointer)await until('!document.querySelector(".cinema-player").classList.contains("controls-visible")');
        const windowBounds=win.getContentBounds(),windowPointer=pointerMessages;
        await moveCursor({x:windowBounds.x+300,y:windowBounds.y+300});
        await until('document.querySelector(".cinema-player").classList.contains("controls-visible")');
        if(!nativePointer)assert.ok(pointerMessages>windowPointer,'Windowed hover must wake controls through the desktop bridge');
        await js('document.querySelector("video").loop=true;document.querySelector(".cinema-player").requestFullscreen()');
        await until('document.fullscreenElement===document.querySelector(".cinema-player")');
        await js('document.activeElement.blur()');
        for(let i=0;i<2;i++){
          if(!nativePointer){
            await until('!document.querySelector(".cinema-player").classList.contains("controls-visible")');
            await sleep(500);
            await js('window.dispatchEvent(new MouseEvent("mousemove",{clientX:200,clientY:200}))');
            await sleep(200);
            assert.equal(await js('document.querySelector(".cinema-player").classList.contains("controls-visible")'),false,'Still cursor must not repeatedly reveal controls');
          }
          // Go through the actual watcher, not a direct IPC injection.
          const bounds=win.getContentBounds(),before=pointerMessages;
          await moveCursor({x:bounds.x+200+i*20,y:bounds.y+200});
          await until('document.querySelector(".cinema-player").classList.contains("controls-visible")');
          if(!nativePointer)assert.ok(pointerMessages>before,'OS watcher must send the wake message');
          await until('Number(getComputedStyle(document.querySelector(".cinema-bottom")).opacity)===1');
          if(i===0){
            await sleep(2400);
            await js('document.querySelectorAll("[data-player-menu]")[1].focus()');
            // A hidden Electron window changes activeElement without dispatching
            // focus events; deliver the browser event explicitly in headless mode.
            if(!nativePointer)await js('document.activeElement.dispatchEvent(new FocusEvent("focusin",{bubbles:true}))');
            await sleep(900);
            assert.equal(await js('document.querySelector(".cinema-player").classList.contains("controls-visible")'),true,'Focusing controls must give a fresh idle timeout while subtitle cues keep changing');
            await js('document.activeElement.blur()');
          }
        }
        if(!nativePointer){
          await until('!document.querySelector(".cinema-player").classList.contains("controls-visible")');
          // Torrent buffering flips waiting/canplay often; that must not pop the
          // controls back up while the pointer is still.
          await js('document.querySelector("video").dispatchEvent(new Event("waiting"))');
          await sleep(300);
          assert.equal(await js('document.querySelector(".cinema-player").classList.contains("controls-visible")'),false,'Buffering must not reveal controls over a still cursor');
          await js('document.querySelector("video").dispatchEvent(new Event("canplay"))');
          await sleep(300);
          assert.equal(await js('document.querySelector(".cinema-player").classList.contains("controls-visible")'),false,'Finishing a buffer must not reveal controls over a still cursor');
          const before=pointerMessages;
          win.webContents.sendInputEvent({type:'mouseMove',x:300,y:300});
          win.webContents.sendInputEvent({type:'mouseMove',x:310,y:300});
          await sleep(300);
          assert.equal(pointerMessages,before,'DOM movement must not be needed while the desktop watcher is active');
          assert.equal(await js('document.querySelector(".cinema-player").classList.contains("controls-visible")'),false,'DOM movement under a still cursor must not wake controls');
          console.log('PASS: Renderer mouse events and buffer changes are ignored when the desktop pointer watcher is active.');
        }
        await js('document.exitFullscreen()');
        if(nativePointer)await moveCursor(originalCursor);
        require('node:fs').writeFileSync(${JSON.stringify(path.join(folder,'player.png'))},(await win.webContents.capturePage()).toPNG());
        console.log('PASS: Fullscreen controls wake across repeated cycles through the desktop bridge.'+(nativePointer?'':' They stay hidden with a still cursor.'));
        console.log('PASS: Electron playback starts at zero, keeps a stable full timeline, preserves pause as the playlist grows, commits one seek per drag, supports keyboard seeking, displays/toggles the newest subtitle, and replaces all old cues across repeated English/Spanish switches.');
        // Online subtitles: Romanian is wanted and the movie has none, so the player searches by itself and
        // moves past the rate-limited closest version to the next site.
        await js('localStorage.setItem("hasimio:settings",JSON.stringify({...JSON.parse(localStorage.getItem("hasimio:settings")||"{}"),subtitleLanguage:"rum",autoSubtitles:true}))');
        await win.loadURL(${JSON.stringify(onlineUrl)});
        await until('document.querySelector(".cinema-notice")?.textContent.includes("subtitles loaded from YIFY Subtitles")');
        await until('document.querySelector(".cinema-caption")?.textContent==="Salut din YIFY"');
        await js('Array.from(document.querySelectorAll("button")).find(button=>button.getAttribute("aria-label")==="Subtitle options").click()');
        await until('document.body.innerText.includes("subs.ro · YIFY Subtitles")');
        console.log('PASS: With no Romanian subtitles in the movie or on OpenSubtitles, the player searched subs.ro and YIFY through the engine, moved past the rate-limited closest version and showed the YIFY subtitle.');
        app.exit(0);
      }catch(error){console.error(error);console.error('pointerMessages='+pointerMessages+', cursor='+JSON.stringify(screen.getCursorScreenPoint()));if(nativePointer)await moveCursor(originalCursor);console.error(await js('JSON.stringify({storage:Object.fromEntries(Object.entries(localStorage).filter(([key])=>/setting|subtitle|caption|player|preference/i.test(key)).map(([key,value])=>[key,value.slice(0,300)])),body:document.body.innerText,video:(()=>{const v=document.querySelector("video");return v?{src:v.currentSrc,ready:v.readyState,paused:v.paused,time:v.currentTime,error:v.error?.message}:null})()})'));app.exit(1);}
    });
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[runner],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  const watchdog=setTimeout(()=>child.kill(),90000);
  const [code]=await once(child,'exit');clearTimeout(watchdog);
  assert.equal(code,0,'Electron player smoke test failed');
  const subsRo=siteRequests.indexOf('https://subs.ro/subtitrare/descarca/subtitrare/501'),yify=siteRequests.indexOf(`https://yifysubtitles.ch/subtitle/${yifySlug}.zip`);
  assert.ok(subsRo>=0&&yify>subsRo,'Automatic loading must try the closest version first, then the next site');
  // Automatic sync may then read the English version cut for this exact release as a timing reference.
  const english=siteRequests.indexOf('https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/101');
  assert.ok(english===-1||english>yify,'An English version may only be read after the Romanian one, as a timing reference');
  console.log('PASS: The rate-limited subs.ro version was tried before YIFY; English was only read afterwards as a timing reference.');
}finally{await vite?.close();await engine.close();media.closeAllConnections();await new Promise(resolve=>media.close(resolve));}
