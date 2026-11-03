'use strict';
// This small installed launcher is stable across downloaded code updates.
const fs=require('fs');
const path=require('path');
const format=require('./update-format.cjs');
const key=fs.readFileSync(path.join(__dirname,'update-public-key.pem'),'utf8');
const bundled=path.join(__dirname,'bundled');
let state=format.readState(),folder=bundled;
global.HASIMIO_TV_UPDATE_KEY=key;
global.HASIMIO_TV_SERVICE=require('webos-service');
global.HASIMIO_TV_BUNDLED_VERSION='__HASIMIO_VERSION__';
function fallback(reason){
  global.HASIMIO_TV_UPDATE_NOTICE=reason;
  if(format.version(state.previous)){
    try{const previous=format.directory(state.previous);format.verifyInstalled(previous,key);folder=previous;state={active:state.previous,previous:undefined,pending:false};format.writeState(state);return;}catch{/* Use the immutable packaged copy. */}
  }
  folder=bundled;state={};format.writeState(state);
}
try{
  if(format.version(state.active)){
    if(state.pending&&state.attempted)fallback('The previous update could not start. Hasimio restored its fallback copy.');
    else{folder=format.directory(state.active);format.verifyInstalled(folder,key);if(state.pending){state.attempted=true;format.writeState(state);}}
  }
}catch{fallback('An update failed verification. Hasimio restored its fallback copy.');}
let ready=false;
global.HASIMIO_TV_READY=function(){ready=true;if(state.pending){state.pending=false;state.attempted=false;format.writeState(state);}};
const watchdog=setTimeout(()=>{if(!ready)process.exit(1);},12000);watchdog.unref();
try{require(path.join(folder,'service.bundle.js'));}
catch(error){
  if(folder===bundled)throw error;
  // A service that threw synchronously may already have bound a socket. Exit
  // and let the next launch use the verified fallback, without double loading.
  fallback('The update failed during startup. Open Hasimio again to use the fallback copy.');process.exit(1);
}
