// Keep the Mac entry point synchronous so failures while loading ESM modules
// can be recorded before the application window exists.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {format}=require('node:util');
const logDir=process.platform==='darwin'
  ?path.join(os.homedir(),'Library','Logs','Hasimio')
  :path.join(os.tmpdir(),'Hasimio');
const logFile=path.join(logDir,'startup.log');
function log(message) {
  try {
    fs.mkdirSync(logDir,{recursive:true});
    fs.appendFileSync(logFile,`${new Date().toISOString()} [${process.pid}] ${message}\n`);
  } catch {/* A logging failure must not prevent startup. */}
}
log(`Bootstrap started: ${process.platform}/${process.arch}, Electron ${process.versions.electron}`);
for(const level of ['log','info','warn','error']) {
  const original=console[level].bind(console);
  console[level]=(...args)=>{log(format(...args));original(...args);};
}
const {app,dialog}=require('electron');
app.setName('Hasimio');
let failed=false;
function fail(error) {
  log(error?.stack||String(error));
  if(failed)return;
  failed=true;
  clearTimeout(timer);
  dialog.showErrorBox('Hasimio could not start',`${error?.message||error}\n\nStartup details were saved to:\n${logFile}`);
  app.exit(1);
}
const timer=setTimeout(()=>fail(new Error('Startup did not finish within 30 seconds.')),30_000);
timer.unref();
app.once('hasimio:startup-ready',()=>{clearTimeout(timer);log('Application window loaded');});
app.once('before-quit',()=>clearTimeout(timer));
app.on('child-process-gone',(_event,details)=>log(`Child process stopped: ${JSON.stringify(details)}`));
process.on('uncaughtException',fail);
process.on('unhandledRejection',fail);
import('./main.mjs').then(()=>log('Main module loaded')).catch(fail);
