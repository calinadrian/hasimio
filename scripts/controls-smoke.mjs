// Real Electron picker/keyboard coverage for the shared control system.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const require=createRequire(import.meta.url),folder=path.resolve('.cache/controls-smoke');
await mkdir(folder,{recursive:true});
await writeFile(path.join(folder,'fixture.tsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import '/src/styles.css';import '/src/shell.css';import '/src/progress.css';import '/src/live-tv.css';import '/src/player.css';import '/src/controls.css';
const genres=['All genres','Action','Adventure','Animation','Biography','Comedy','Crime','Documentary','Drama','Family','Fantasy','History','Horror','Music','Mystery','Romance','Sci-Fi','Science Fiction','Short','Sport'];
const field=(label,values)=> <label style={{display:'grid',gap:8,minWidth:0}}>{label}<select style={{alignSelf:'start',width:'100%'}} aria-label={label} onChange={e=>{window.lastChoice=e.target.value;}}>{values.map(v=><option key={v}>{v}</option>)}</select></label>;
createRoot(document.getElementById('root')).render(<div style={{padding:24,maxWidth:1100,color:'#ededed'}} className="controls-demo"><style>{'.controls-demo .cinema-player{min-height:0;background:transparent}.controls-demo .cinema-menu{position:static;padding:0;border:0;background:none;box-shadow:none}.controls-demo .filters,.controls-demo .live-tv-server,.controls-demo .episode-selector{display:block;margin:0}.controls-demo .cinema-field{margin:0}'}</style><h1>Hasimio controls</h1><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:24,alignItems:'start',marginTop:24,padding:24,background:'#202020',borderRadius:20}}>
<div className="filters">{field('Genre',genres)}</div><div className="live-tv-server">{field('Server',['Server 1','Server 2 · Alternative'])}</div><div className="progress-sort">{field('Sort series',['Recent activity','Title A–Z','Most complete'])}</div><div className="episode-selector">{field('Season',['Season 1','Season 2','Season 3'])}</div>
<div className="cinema-player"><div className="cinema-menu"><div className="audio-controls">{field('Audio track',Array.from({length:40},(_,i)=>i===0?'Original audio':'English · Audio track '+i))}</div></div></div>
<div className="cinema-field">{field('Subtitles',['Off','English','Romanian','Français'])}</div>
<div><p>Actions</p><div style={{display:'flex',flexWrap:'wrap',gap:10,marginTop:10}}><button className="button primary">Watch channel</button><button className="button secondary">Reload</button><button className="button secondary" disabled>Unavailable</button></div></div>
<div><p>Filters</p><div className="segmented" style={{marginTop:10}}><button className="selected">All</button><button>Movies</button><button>Series</button></div></div>
</div><dialog id="test-dialog"><label className="cinema-field">Playback speed<select aria-label="Playback speed"><option>Normal</option><option>1.5×</option><option>2×</option></select></label><button className="button secondary" onClick={()=>document.querySelector('dialog').close()}>Close</button></dialog></div>);
`);
const vite=await createServer({configFile:false,plugins:[react(),{name:'controls-fixture',configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(req.url!=='/controls-test')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/controls-test','<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/.cache/controls-smoke/fixture.tsx"></script></body></html>'));
});}}],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/.cache/**']}}});
await vite.listen();
async function run({url,folder}){
  const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
  app.setPath('userData',folder+'/profile');await app.whenReady();
  const win=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{backgroundThrottling:false}});
  const js=s=>win.webContents.executeJavaScript(s,true);
  const frame=()=>js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const key=async code=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:code});win.webContents.sendInputEvent({type:'keyUp',keyCode:code});await frame();};
  const wait=async s=>{for(let i=0;i<100;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out: '+s);};
  try{
    await win.loadURL(url+'controls-test');win.show();win.focus();win.webContents.focus();await wait('document.querySelectorAll("select").length===7');
    assert.equal(await js('CSS.supports("appearance","base-select")'),true);
    const styles=await js('[...document.querySelectorAll("select")].map(s=>({appearance:getComputedStyle(s).appearance,radius:getComputedStyle(s).borderRadius}))');
    assert.ok(styles.every(s=>s.appearance==='base-select'&&s.radius==='12px'),JSON.stringify(styles));
    await js('document.querySelector(\'[aria-label="Genre"]\').focus();document.activeElement.showPicker()');await frame();
    assert.equal(await js('document.querySelector(\'[aria-label="Genre"]\').matches(":open")'),true);
    await fs.writeFile(folder+'/genre.png',(await win.webContents.capturePage()).toPNG());
    await key('Down');await key('Return');
    assert.equal(await js('document.querySelector(\'[aria-label="Genre"]\').value'),'Action');
    assert.equal(await js('window.lastChoice'),'Action');
    await js('document.querySelector(\'[aria-label="Server"]\').focus();document.activeElement.showPicker()');await frame();
    await fs.writeFile(folder+'/server.png',(await win.webContents.capturePage()).toPNG());
    await key('Down');await key('Return');
    assert.equal(await js('window.lastChoice'),'Server 2 · Alternative');
    await js('document.querySelector(\'[aria-label="Server"]\').focus();document.activeElement.showPicker()');await key('Escape');
    assert.equal(await js('document.querySelector(\'[aria-label="Server"]\').matches(":open")'),false);
    assert.equal(await js('document.querySelector(".button:disabled").disabled'),true);
    await js('document.querySelector("dialog").showModal();document.querySelector(\'[aria-label="Playback speed"]\').focus();document.activeElement.showPicker()');await frame();
    assert.equal(await js('document.querySelector(\'[aria-label="Playback speed"]\').matches(":open")'),true,'Picker works inside modal top layer');
    await key('Down');await key('Return');
    assert.equal(await js('document.querySelector(\'[aria-label="Playback speed"]\').value'),'1.5×');
    await js('document.querySelector("dialog").close()');
    win.setContentSize(390,844);await frame();
    assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true,'Controls fit phone width');
    await js('document.querySelector(\'[aria-label="Genre"]\').focus();document.activeElement.showPicker()');await frame();
    await fs.writeFile(folder+'/mobile.png',(await win.webContents.capturePage()).toPNG());
    console.log('PASS: All seven select contexts share the style; real keyboard selection/change events, Escape, modal picker, disabled action and mobile overflow.');app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
}
const runner=path.join(folder,'electron.cjs');await writeFile(runner,`(${run.toString()})(${JSON.stringify({url:vite.resolvedUrls.local[0],folder})})`);
try{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(require('electron'),[runner],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);const timer=setTimeout(()=>child.kill(),30000);const [code]=await once(child,'exit');clearTimeout(timer);assert.equal(code,0);}finally{await vite.close();}
