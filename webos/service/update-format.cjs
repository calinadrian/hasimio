'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = '/media/internal/app.hasimio.tv';
const MAX_FILES = 64;
const MAX_UNPACKED = 4 * 1024 * 1024;
function version(value) { return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value); }
function newer(left, right) { const a=left.split('.').map(Number),b=right.split('.').map(Number); for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false; }
function allowed(file) { return ['service.bundle.js','ca.pem','THIRD-PARTY-NOTICES.txt'].includes(file) || /^www\/(?:index\.html|favicon\.png|assets\/[A-Za-z0-9._-]+\.(?:js|css|png|svg|woff2))$/.test(file); }
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function directory(value) { if(!version(value))throw Error('Invalid update version.');return path.join(ROOT,'updates',value); }
function verify(text, signature, key) {
  if(Buffer.byteLength(text)>32768||signature.length>1024)throw Error('Update metadata is too large.');
  const verifier=crypto.createVerify('RSA-SHA256');verifier.update(text);
  if(!verifier.verify(key,signature))throw Error('The update signature is invalid.');
  const manifest=JSON.parse(text);
  if(manifest.schema!==1||manifest.launcherApi!==1||manifest.appId!=='app.hasimio.tv'||!version(manifest.version)||!Array.isArray(manifest.files)||manifest.files.length>MAX_FILES)throw Error('This update needs a newer TV installer.');
  if(!manifest.payload||manifest.payload.name!=='hasimio-webos-update.json.gz'||!/^[a-f\d]{64}$/.test(manifest.payload.sha256)||!Number.isSafeInteger(manifest.payload.size)||manifest.payload.size<1||manifest.payload.size>2*1024*1024||!Number.isSafeInteger(manifest.payload.unpackedSize)||manifest.payload.unpackedSize<1||manifest.payload.unpackedSize>6*1024*1024)throw Error('Invalid update payload.');
  const seen=new Set();let bytes=0;
  manifest.files.forEach(file=>{
    if(!file||!allowed(file.path)||seen.has(file.path)||!/^[a-f\d]{64}$/.test(file.sha256)||!Number.isSafeInteger(file.size)||file.size<0||file.size>2*1024*1024)throw Error('Invalid update file.');
    seen.add(file.path);bytes+=file.size;
  });
  if(bytes>MAX_UNPACKED||!seen.has('service.bundle.js')||!seen.has('www/index.html')||!seen.has('ca.pem'))throw Error('The update exceeds the TV storage budget.');
  return manifest;
}
function verifyInstalled(folder,key){
  const text=fs.readFileSync(path.join(folder,'update.json'),'utf8');
  const signature=fs.readFileSync(path.join(folder,'update.sig'));
  const manifest=verify(text,signature,key);
  manifest.files.forEach(file=>{const filename=path.join(folder,file.path),stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==file.size||sha256(fs.readFileSync(filename))!==file.sha256)throw Error('An installed update file failed verification.');});
  return manifest;
}
function readState(){try{return JSON.parse(fs.readFileSync(path.join(ROOT,'update-state.json'),'utf8'));}catch{return {};}}
// Node 8 mkdir has no recursive option. This only creates paths in our own
// application data directory, one component at a time.
function mkdir(folder){if(fs.existsSync(folder))return;const parent=path.dirname(folder);if(parent!==folder)mkdir(parent);try{fs.mkdirSync(folder,0o700);}catch(error){if(error.code!=='EEXIST')throw error;}}
function saveState(value){mkdir(ROOT);const temporary=path.join(ROOT,'update-state.tmp');fs.writeFileSync(temporary,JSON.stringify(value),{mode:0o600});fs.renameSync(temporary,path.join(ROOT,'update-state.json'));}
module.exports={ROOT,MAX_FILES,MAX_UNPACKED,version,newer,allowed,sha256,directory,verify,verifyInstalled,readState,writeState:saveState,mkdir};
