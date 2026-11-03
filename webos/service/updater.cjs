'use strict';
const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const format=require('./update-format.cjs');

const repository='https://github.com/calinadrian/hasimio';
const api='https://api.github.com/repos/calinadrian/hasimio/releases?per_page=40';
const manifestName='hasimio-webos-update.json';
const signatureName='hasimio-webos-update.sig';
module.exports=function createUpdater(options){
  let checked=0,checking,applying,available,download,error='';
  const key=global.HASIMIO_TV_UPDATE_KEY;
  function status(){const state=format.readState();return {current:options.version,bundled:global.HASIMIO_TV_BUNDLED_VERSION,available:available&&available.version,restartReady:(format.version(state.active)?state.active:global.HASIMIO_TV_BUNDLED_VERSION)!==options.version,checking:Boolean(checking),installing:Boolean(applying),checkedAt:checked,error,notice:global.HASIMIO_TV_UPDATE_NOTICE,canRollback:format.version(state.previous)||options.version!==global.HASIMIO_TV_BUNDLED_VERSION,releaseUrl:available&&repository+'/releases/tag/webos-v'+available.version};}
  async function bytes(url,maximum){
    const response=await fetch(url,{headers:{Accept:url.startsWith('https://api.github.com/')?'application/vnd.github+json':'application/octet-stream','User-Agent':'Hasimio-TV/'+options.version},signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw Error('GitHub returned HTTP '+response.status+'. Try again later.');
    if(Number(response.headers.get('content-length'))>maximum)throw Error('The update exceeds the TV download budget.');
    const value=Buffer.from(await response.arrayBuffer());if(value.length>maximum)throw Error('The update exceeds the TV download budget.');return value;
  }
  async function find(){
    error='';
    try{
      const releases=JSON.parse((await bytes(api,2*1024*1024)).toString('utf8'));
      if(!Array.isArray(releases))throw Error('GitHub did not return a release list.');
      const candidates=releases.filter(release=>!release.draft&&!release.prerelease&&/^webos-v\d+\.\d+\.\d+$/.test(release.tag_name)&&Array.isArray(release.assets)).sort((a,b)=>format.newer(a.tag_name.slice(7),b.tag_name.slice(7))?-1:1);
      const release=candidates.find(item=>item.assets.some(asset=>asset.name===manifestName)&&item.assets.some(asset=>asset.name===signatureName));
      if(!release){available=undefined;download=undefined;checked=Date.now();return status();}
      const base=repository+'/releases/download/'+release.tag_name+'/';
      const text=(await bytes(base+manifestName,32768)).toString('utf8');
      const signature=await bytes(base+signatureName,1024);
      const manifest=format.verify(text,signature,key);
      if(release.tag_name!=='webos-v'+manifest.version)throw Error('The update version does not match its GitHub release.');
      checked=Date.now();available=format.newer(manifest.version,options.version)?manifest:undefined;
      download=available?{base,text,signature}:undefined;
      return status();
    }catch(problem){error=problem.message||'Could not check GitHub updates.';throw problem;}
  }
  function check(){if(checking)return checking;checking=find().then(()=>{checking=undefined;return status();},problem=>{checking=undefined;throw problem;});return checking;}
  function unpack(compressed,maximum){return new Promise((resolve,reject)=>{const unzip=zlib.createGunzip(),chunks=[];let size=0;unzip.on('data',chunk=>{size+=chunk.length;if(size>maximum){unzip.destroy();reject(Error('The update exceeds the TV extraction budget.'));}else chunks.push(chunk);});unzip.once('error',reject);unzip.once('end',()=>resolve(Buffer.concat(chunks,size)));unzip.end(compressed);});}
  function remove(folder){
    // Only version folders and our temporary update folder can be removed.
    const parent=path.join(format.ROOT,'updates')+path.sep;
    if(!path.resolve(folder).startsWith(parent))throw Error('Invalid update cleanup path.');
    if(!fs.existsSync(folder))return;
    if(fs.lstatSync(folder).isSymbolicLink()){fs.unlinkSync(folder);return;}
    for(const name of fs.readdirSync(folder)){const file=path.join(folder,name),stat=fs.lstatSync(file);if(stat.isDirectory()&&!stat.isSymbolicLink())remove(file);else fs.unlinkSync(file);}
    fs.rmdirSync(folder);
  }
  async function install(){
    await check();if(!available||!download)throw Error('No newer TV update is available.');
    const manifest=available,source=download;
    await options.stopPlayback();
    const compressed=await bytes(source.base+manifest.payload.name,2*1024*1024);
    if(compressed.length!==manifest.payload.size||format.sha256(compressed)!==manifest.payload.sha256)throw Error('The update download failed integrity verification.');
    const raw=await unpack(compressed,manifest.payload.unpackedSize);
    if(raw.length!==manifest.payload.unpackedSize)throw Error('The update payload size is incorrect.');
    const files=JSON.parse(raw.toString('utf8'));
    if(!Array.isArray(files)||files.length!==manifest.files.length)throw Error('The update file list is invalid.');
    const staging=path.join(format.ROOT,'updates','.pending');
    remove(staging);format.mkdir(staging);
    try{
      const seen=new Set();
      for(const item of files){
        const expected=manifest.files.find(file=>file.path===item.path);
        if(!expected||seen.has(item.path)||typeof item.data!=='string')throw Error('Unexpected update file.');
        const content=Buffer.from(item.data,'base64');
        if(content.length!==expected.size||format.sha256(content)!==expected.sha256)throw Error('An update file failed verification.');
        seen.add(item.path);
        const filename=path.join(staging,expected.path);format.mkdir(path.dirname(filename));fs.writeFileSync(filename,content,{mode:0o600});
      }
      fs.writeFileSync(path.join(staging,'update.json'),source.text,{mode:0o600});fs.writeFileSync(path.join(staging,'update.sig'),source.signature,{mode:0o600});
      format.verifyInstalled(staging,key);
      const target=format.directory(manifest.version),state=format.readState();
      if(state.active===manifest.version)throw Error('This update is already staged. Restart Hasimio.');
      remove(target);fs.renameSync(staging,target);
      const previous=options.version===global.HASIMIO_TV_BUNDLED_VERSION?undefined:options.version;
      format.writeState({active:manifest.version,previous,pending:true,attempted:false});
      for(const name of fs.readdirSync(path.join(format.ROOT,'updates')))if(format.version(name)&&name!==manifest.version&&name!==previous)remove(format.directory(name));
      return status();
    }catch(problem){remove(staging);throw problem;}
  }
  function apply(){if(applying)return applying;error='';applying=install().then(()=>{applying=undefined;return status();},problem=>{applying=undefined;error=problem.message;throw problem;});return applying;}
  async function rollback(){if(applying)throw Error('Wait for the download to finish.');await options.stopPlayback();const state=format.readState();if(format.version(state.previous)){format.verifyInstalled(format.directory(state.previous),key);format.writeState({active:state.previous,pending:false});}else format.writeState({});return status();}
  return {status,check,apply,rollback};
};
