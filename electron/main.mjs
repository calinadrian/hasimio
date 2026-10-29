// Hasimio desktop app: runs Hasimio Engine in a utility process and shows the Hasimio UI it serves.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {app,BrowserWindow,dialog,ipcMain,Menu,screen,session,shell,utilityProcess} from 'electron';
import {watchPointerActivity} from './player-activity.mjs';
import electronUpdater from 'electron-updater';
import {createUpdates} from './updates.mjs';
import {ENGINE_PORT} from '../server/engine.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const APP_ID='app.hasimio.desktop';
const HOUR=60*60_000;
const icon=path.join(app.getAppPath(),'resources','icon.png');

let win;let engine;let origin;let quitting=false;let engineStopped=false;

app.setName('Hasimio');
app.setAppUserModelId(APP_ID);
const primary=app.requestSingleInstanceLock();

/** Written right before an update installs and read on the next start, to log the version change. */
const updateMarker=path.join(app.getPath('userData'),'update.json');
let afterUpdate;
try {if(primary){afterUpdate=JSON.parse(fs.readFileSync(updateMarker,'utf8'));fs.rmSync(updateMarker);}}catch {/* no update just happened */}

const updates=createUpdates({
  current:app.getVersion(),
  // Only installed copies update; electron-updater needs the app-update.yml that the installer adds.
  updater:app.isPackaged?electronUpdater.autoUpdater:null,
  publish:state=>{if(win&&!win.isDestroyed())win.webContents.send('hasimio:update',state);},
  beforeInstall:()=>{quitting=true;},
});
function installUpdate() {
  if(updates.get().status!=='ready')return;
  try {fs.writeFileSync(updateMarker,JSON.stringify({from:app.getVersion()}));}catch {/* the update still installs */}
  updates.install();
}

/** Sites besides the app itself that may use this engine, e.g. a hosted Hasimio page: %APPDATA%\Hasimio\engine.json. */
function allowedOrigins() {
  try {const config=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'engine.json'),'utf8'));return Array.isArray(config.allowedOrigins)?config.allowedOrigins.map(String):[];}
  catch {return [];}
}

function startEngine() {
  return new Promise((resolve,reject)=>{
    engine=utilityProcess.fork(path.join(__dirname,'engine-process.mjs'),[],{serviceName:'Hasimio Engine'});
    const timer=setTimeout(()=>reject(new Error('Hasimio Engine did not start within 20 seconds.')),20_000);
    engine.once('message',message=>{
      clearTimeout(timer);
      if(message?.type==='ready')resolve(message.port);
      else reject(Object.assign(new Error(message?.message||'Hasimio Engine could not start.'),{code:message?.code}));
    });
    engine.once('exit',code=>{
      engineStopped=true;clearTimeout(timer);reject(new Error(`Hasimio Engine stopped (code ${code}).`));
      if(!quitting&&origin){dialog.showErrorBox('Hasimio stopped streaming','The streaming engine closed unexpectedly. Hasimio will close; start it again to keep watching.');app.quit();}
    });
    engine.postMessage({port:ENGINE_PORT,uiRoot:path.join(app.getAppPath(),'dist'),allowedOrigins:allowedOrigins()});
  });
}

function showWindow() {
  if(!win||win.isDestroyed())createWindow();
  if(win.isMinimized())win.restore();
  win.show();win.focus();
}

function createWindow() {
  win=new BrowserWindow({
    width:1280,height:820,minWidth:900,minHeight:600,show:false,title:'Hasimio',backgroundColor:'#141414',icon,autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true},
  });
  watchPointerActivity(win,screen);
  // Links to other sites open in the browser; the window only ever shows the app.
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url))void shell.openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/')){event.preventDefault();if(/^https?:\/\//i.test(url))void shell.openExternal(url);}});
  win.once('ready-to-show',()=>win.show());
  void win.loadURL(origin+'/');
}

async function start() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'File',submenu:[{label:'Quit Hasimio',accelerator:'Ctrl+Q',click:()=>app.quit()}]},
    {role:'editMenu'},{role:'viewMenu'},
  ]));
  session.defaultSession.setPermissionRequestHandler((_contents,permission,callback)=>callback(['fullscreen','clipboard-sanitized-write'].includes(permission)));
  let port;
  try {port=await startEngine();}
  catch(error){
    dialog.showErrorBox('Hasimio could not start',error.code==='EADDRINUSE'?`Another program is using port ${ENGINE_PORT}. If Hasimio Engine (the zip version) is running, close it, then start Hasimio again.`:error.message);
    quitting=true;app.quit();return;
  }
  origin=`http://127.0.0.1:${port}`;
  ipcMain.handle('hasimio:update-state',()=>updates.get());
  ipcMain.handle('hasimio:update-check',()=>updates.check());
  ipcMain.handle('hasimio:update-install',()=>installUpdate());
  createWindow();
  if(afterUpdate&&afterUpdate.from!==app.getVersion())console.log(`[hasimio] updated from ${afterUpdate.from} to ${app.getVersion()}`);
  // Check soon after starting, hourly, and when Hasimio comes back to the front, so releases reach open copies quickly.
  if(updates.get().status!=='dev'){setTimeout(()=>updates.check(),10_000);setInterval(()=>updates.check(),HOUR).unref();app.on('browser-window-focus',()=>{if(Date.now()-(updates.get().checkedAt??0)>HOUR/4)updates.check();});}
}

if(!primary)app.quit();
else {
  app.on('second-instance',()=>{if(origin)showWindow();});
  app.whenReady().then(start).catch(error=>{dialog.showErrorBox('Hasimio could not start',error.message);app.quit();});
}

// Closing the window quits Hasimio. The engine stops first, so torrents and converted files are cleaned up.
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{
  quitting=true;
  if(!engine||engineStopped)return;
  event.preventDefault();
  const done=()=>{engineStopped=true;app.quit();};
  engine.once('exit',done);
  setTimeout(()=>{engine.kill();done();},5000).unref();
  engine.postMessage({type:'stop'});
});
