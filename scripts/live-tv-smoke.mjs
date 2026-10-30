// --live verifies the real broadcast; default uses locally generated HLS video.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import ffmpeg from 'ffmpeg-static';
const require=createRequire(import.meta.url),live=process.argv.includes('--live'),folder=path.resolve('.cache/live-tv-smoke');
await mkdir(folder,{recursive:true});await mkdir('.impeccable/review',{recursive:true});
const fixture={name:'live-tv-video-fixture',configureServer(server){
  server.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/api/live-tv/'))return next();const name=req.url.endsWith('index.m3u8')?'fixture.m3u8':path.basename(req.url);if(!/^(fixture\.m3u8|part\d+\.ts)$/.test(name)){res.writeHead(404);return res.end();}void readFile(path.join(folder,name)).then(data=>{res.setHeader('Content-Type',name.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t');res.end(data);},()=>{res.writeHead(404);res.end();});});
}};
if(!live)await promisify(execFile)(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libx264','-preset','ultrafast','-g','50','-pix_fmt','yuv420p','-c:a','aac','-hls_time','2','-hls_list_size','0','-hls_segment_filename',path.join(folder,'part%d.ts'),path.join(folder,'fixture.m3u8')],{windowsHide:true});
const vite=await createServer({...(live?{}:{configFile:false,plugins:[react(),fixture]}),server:{host:'127.0.0.1',port:0,watch:{ignored:['**/.cache/**']}}});
await vite.listen();
async function run({url,profile,shots,live}){
  const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
  app.setPath('userData',profile);await app.whenReady();
  const win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{backgroundThrottling:false}});
  const js=s=>win.webContents.executeJavaScript(s,true);
  const wait=async s=>{for(let i=0;i<500;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out: '+s);};
  const click=async s=>{await js(`(${s}).click()`);await new Promise(r=>setTimeout(r,80));};
  try{
    await win.loadURL(url);
    await js(`localStorage.clear();localStorage.setItem('hasimio:addons','[]');localStorage.setItem('hasimio:settings','{"muted":true}');`);
    await win.reload();
    await wait('!!document.querySelector(\'.nav-item[aria-label="Live TV"]\')');
    await click('document.querySelector(\'.nav-item[aria-label="Live TV"]\')');
    assert.equal(await js('document.querySelectorAll(".live-tv-stage iframe").length'),0);
    assert.equal(await js('document.querySelectorAll(".live-tv-stage video").length'),0);
    assert.equal(await js('document.querySelectorAll(".live-tv-page a").length'),0,'No original website button');
    await click('document.querySelector(".live-tv-idle .primary")');
    await wait('document.querySelector(".live-tv-video")?.readyState>=3');
    await js('document.querySelector(".live-tv-video").play()');
    await wait('document.querySelector(".live-tv-video")?.currentTime>0.5');
    const video=await js('(()=>{const v=document.querySelector(".live-tv-video");return {width:v.videoWidth,height:v.videoHeight,decoded:v.getVideoPlaybackQuality?.().totalVideoFrames??0}})()');
    assert.ok(video.width>0&&video.height>0&&video.decoded>0,'Real video frames must decode');
    assert.equal(await js('document.querySelectorAll(".live-tv-stage iframe").length'),0,'Only video, never provider HTML');
    await win.webContents.capturePage(undefined,{stayHidden:true});win.webContents.invalidate();
    await new Promise(r=>setTimeout(r,250));
    await fs.writeFile(shots+'/live-tv-desktop.png',(await win.webContents.capturePage(undefined,{stayHidden:true})).toPNG());
    await js('(()=>{const s=document.querySelector(".live-tv-server select");s.value="1";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await wait('document.querySelector(".live-tv-video")?.readyState>=3');
    await js('document.querySelector(".live-tv-video").play()');
    await wait('document.querySelector(".live-tv-video")?.currentTime>0.5');
    win.setContentSize(390,844);await new Promise(r=>setTimeout(r,250));
    assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true,'Mobile fits');
    await fs.writeFile(shots+'/live-tv-mobile.png',(await win.webContents.capturePage(undefined,{stayHidden:true})).toPNG());
    await click('[...document.querySelectorAll(".live-tv-actions button")].find(e=>e.textContent==="Stop")');
    assert.equal(await js('document.querySelectorAll(".live-tv-video").length'),0,'Stop removes video and HLS session');
    for(const [index,name,servers] of [[1,'A1',2],[2,'TLC',1]]){
      await js(`(()=>{const s=document.querySelector('.live-tv-channel-picker select');s.value='${index}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await wait(`document.querySelector('.live-tv-channel-title h2')?.textContent==='${name}'`);
      assert.equal(await js('document.querySelectorAll(".live-tv-video").length'),0,'Changing channels stops the previous player');
      assert.equal(await js('document.querySelector(".live-tv-server select").value'),'0','Channel starts with first server');
      assert.equal(await js('document.querySelector(".live-tv-server select").options.length'),servers);
      for(let server=0;server<servers;server++){
        if(server===0)await click('document.querySelector(".live-tv-idle .primary")');
        else{
          await js(`(()=>{window.previousLiveVideo=document.querySelector('.live-tv-video');const s=document.querySelector('.live-tv-server select');s.value='${server}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
          await wait('document.querySelector(".live-tv-video")!==window.previousLiveVideo');
        }
        await wait('document.querySelector(".live-tv-video")?.readyState>=3');
        await js('document.querySelector(".live-tv-video").play()');
        await wait('document.querySelector(".live-tv-video")?.currentTime>0.5');
      }
      assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true,'Channel picker fits mobile');
      win.webContents.invalidate();await new Promise(r=>setTimeout(r,250));
      await fs.writeFile(shots+'/live-tv-'+name.toLowerCase()+'.png',(await win.webContents.capturePage(undefined,{stayHidden:true})).toPNG());
    }
    console.log(`PASS: ${live?'Actual broadcasts':'Generated HLS fixture'} decoded; Cartoon Network and A1 both servers, TLC, channel switching, Stop, native video only, mobile layout.`);
    app.exit(0);
  }catch(error){console.error(error);console.error(await js('document.querySelector(".live-tv-stage")?.textContent'));app.exit(1);}
}
const runner=path.join(folder,'electron.cjs');
await writeFile(runner,`(${run.toString()})(${JSON.stringify({url:vite.resolvedUrls.local[0],profile:path.join(folder,'profile'),shots:path.resolve('.impeccable/review'),live})})`);
try{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[runner],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  const watchdog=setTimeout(()=>child.kill(),60000);
  const [code]=await once(child,'exit');clearTimeout(watchdog);assert.equal(code,0,'Live TV playback smoke failed');
}finally{await vite.close();}
