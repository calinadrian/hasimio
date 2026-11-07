// Standalone APK packaging using Android's SDK/NDK tools. Does not launch or test the app.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {rootCertificates} from 'node:tls';
import {build as vite} from 'vite';
import react from '@vitejs/plugin-react';
import {build as esbuild} from 'esbuild';
import {zipSync,unzipSync} from 'fflate';
import {icon} from './make-icon.mjs';
import rewritePattern from 'regexpu-core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arm32=process.argv.includes('--arm32');
const abi=arm32?'armeabi-v7a':'arm64-v8a';
const suffix=arm32?abi:'arm64';
const updateManifest=arm32?'hasimio-android-update-armeabi-v7a.json':'hasimio-android-update.json';
const sysrootArch=arm32?'arm-linux-androideabi':'aarch64-linux-android';
const compilerTarget=arm32?'armv7a-linux-androideabi28':'aarch64-linux-android28';
const cache=path.join(root,'.cache/android'),output=path.join(root,'release/android'),work=path.join(output,'staging');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const parts=pkg.version.split('.').map(Number);
if(parts.length!==3||parts.some(n=>!Number.isInteger(n)||n<0||n>=1000))throw Error('Android needs a numeric major.minor.patch version (each part < 1000).');
const code=parts[0]*1000000+parts[1]*1000+parts[2];
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||(process.platform==='win32'?'C:/Android/Sdk':path.join(os.homedir(),'Android/Sdk'));
const tools=path.join(sdk,'build-tools',process.env.ANDROID_BUILD_TOOLS||'34.0.0');
const jar=path.join(sdk,'platforms/android-34/android.jar');
const ndk=process.env.ANDROID_NDK_HOME||path.join(sdk,'ndk','27.3.13750724');
const host=process.platform==='win32'?'windows-x86_64':process.platform==='darwin'?'darwin-x86_64':'linux-x86_64';
const llvm=path.join(ndk,'toolchains/llvm/prebuilt',host);
const exe=name=>name+(process.platform==='win32'?'.exe':'');
const java=name=>process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',exe(name)):name;
async function run(command,args,env={}){
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,TMP:path.join(work,'tmp'),TEMP:path.join(work,'tmp'),TMPDIR:path.join(work,'tmp'),...env}});
    child.once('error',reject);child.once('exit',status=>status===0?resolve():reject(Error(path.basename(command)+' failed ('+status+').')));
  });
}
for(const filename of [jar,path.join(tools,exe('aapt2')),path.join(llvm,'bin',exe('clang++'))])await fs.access(filename);
// Every recursive operation is restricted to our generated staging folder.
if(work!==path.resolve(root,'release/android/staging'))throw Error('Invalid staging path.');
await fs.rm(work,{recursive:true,force:true});await fs.mkdir(work,{recursive:true});await fs.mkdir(cache,{recursive:true});
await fs.mkdir(path.join(work,'tmp'),{recursive:true});
const engine=path.join(work,'assets/engine');await fs.mkdir(engine,{recursive:true});
await vite({root,configFile:false,plugins:[react()],define:{'import.meta.env.VITE_ANDROID':'"true"','import.meta.env.VITE_ANDROID_ARM32':JSON.stringify(arm32?'true':'false'),'import.meta.env.VITE_WEBOS':'"false"','import.meta.env.VITE_ENGINE_URL':'undefined'},build:{outDir:path.join(engine,'www'),emptyOutDir:true,target:'chrome100',rollupOptions:{input:path.join(root,'android.html')}}});
await fs.rename(path.join(engine,'www/android.html'),path.join(engine,'www/index.html'));
const html=path.join(engine,'www/index.html');
await fs.writeFile(html,(await fs.readFile(html,'utf8')).replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="frame-src \'none\'; object-src \'none\'"/>'));

// Reuse the TV's bounded TCP/DHT torrent engine and online catalogs. Avoid
// node:sqlite, FFmpeg executables and desktop native WebRTC dependencies.
const bundled=await esbuild({absWorkingDir:root,entryPoints:['webos/service/main.cjs'],outfile:path.join(engine,'engine.cjs'),bundle:true,platform:'node',target:'node18',format:'cjs',minify:true,keepNames:true,metafile:true,
  define:{HASIMIO_VERSION:JSON.stringify(pkg.version)},plugins:[{name:'android-engine',setup(build){
    build.onResolve({filter:/^\.\/updater\.cjs$/},()=>({path:'android-updater',namespace:'android-stub'}));
    build.onResolve({filter:/^(bufferutil|utf-8-validate|fs-chunk-store|load-ip-set|create-torrent|render-media)$/},args=>({path:args.path,namespace:'android-stub'}));
    build.onLoad({filter:/.*/,namespace:'android-stub'},args=>({contents:args.path==='android-updater'?'module.exports=()=>({status:()=>({}),check:async()=>({}),apply:async()=>{throw Error("Use Android app updates.");}});':args.path==='load-ip-set'?'module.exports=null;':'module.exports=function(){throw Error("Unavailable on Android.");};',loader:'js'}));
    build.onLoad({filter:/\.(mjs|cjs|js)$/},async args=>{
      let contents=await fs.readFile(args.path,'utf8');const normalized=args.path.replaceAll('\\','/');
      // The pinned mobile runtime is built without ICU and rejects Unicode
      // property escapes at parse time, despite reporting Node 18. Expand the
      // title-normalization classes into explicit Unicode ranges as on TV.
      contents=contents.replace(/\/([\[][\^]\\p\{L\}\\p\{N\} ?\]\+?)\/gu/g,(_,pattern)=>'/'+rewritePattern(pattern,'gu',{unicodePropertyEscapes:'transform'})+'/gu');
      if(/\\[pP]\{/.test(contents))throw Error('Review unsupported Unicode property escapes for Android: '+normalized);
      if(normalized.endsWith('/webtorrent/lib/torrent.js')){
        const needle='this.store = new ImmediateChunkStore(';
        if(!contents.includes(needle))throw Error('Review WebTorrent metadata limits after dependency changes.');
        contents=contents.replace(needle,'if(!Number.isSafeInteger(this.pieceLength)||this.pieceLength<1||this.pieceLength>4*1024*1024||this.pieces.length>32768||this.files.length>1000){this._destroy(new Error("Torrent exceeds the device metadata budget."));return;}\n'+needle);
      }
      if(normalized.endsWith('/webos/service/server.mjs'))contents=contents.replace("platform:'webos'","platform:'android'");
      return {contents,loader:'js',resolveDir:path.dirname(args.path)};
    });
  }}]});
await fs.writeFile(path.join(engine,'ca.pem'),rootCertificates.join('\n')+'\n');
// Ship licenses for bundled runtime dependencies and the embedded Node runtime.
const packages=new Set();
for(const name of Object.keys(bundled.metafile.inputs)){
  if(!name.includes('node_modules'))continue;
  let directory=path.dirname(path.resolve(root,name));
  while(directory!==path.dirname(directory)){
    try{await fs.access(path.join(directory,'package.json'));packages.add(directory);break;}catch{directory=path.dirname(directory);}
  }
}
for(const name of ['react','react-dom','scheduler','lucide-react','hls.js','fflate','qrcode'])packages.add(path.join(root,'node_modules',name));
const notices=[];
for(const directory of [...packages].sort()){
  const info=JSON.parse(await fs.readFile(path.join(directory,'package.json'),'utf8'));notices.push(info.name+' '+info.version+' '+(info.license||'See license'));
  for(const file of await fs.readdir(directory))if(/^(license|licence|copying|notice)(\.|$)/i.test(file))if((await fs.stat(path.join(directory,file))).isFile())notices.push(await fs.readFile(path.join(directory,file),'utf8'));
}
const archive=path.join(cache,'nodejs-mobile-v18.20.4-android.zip');
try{await fs.access(archive);}catch{
  console.log('Downloading pinned Node.js Mobile runtime…');
  const response=await fetch('https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip');if(!response.ok)throw Error('Node runtime download failed: '+response.status);
  await fs.writeFile(archive,new Uint8Array(await response.arrayBuffer()));
}
const runtime=await fs.readFile(archive);
if(crypto.createHash('sha256').update(runtime).digest('hex')!=='bd7321eaa1a7602fbe0bb87302df2d79d87835cf4363fbdd17c350dbb485c2af')throw Error('Node runtime archive checksum mismatch.');
const nodeLibrary=`bin/${abi}/libnode.so`;
const library=unzipSync(runtime,{filter:file=>file.name===nodeLibrary})[nodeLibrary];
if(!library)throw Error('Node runtime is missing '+abi+'.');
const lib=path.join(work,'lib',abi);await fs.mkdir(lib,{recursive:true});await fs.writeFile(path.join(lib,'libnode.so'),library);
const nodeLicense=path.join(cache,'NODE-LICENSE');
try{await fs.access(nodeLicense);}catch{const response=await fetch('https://raw.githubusercontent.com/nodejs-mobile/nodejs-mobile/v18.20.4/LICENSE');if(!response.ok)throw Error('Could not fetch Node runtime notices.');await fs.writeFile(nodeLicense,await response.text());}
notices.push(await fs.readFile(nodeLicense,'utf8'));
await fs.writeFile(path.join(engine,'THIRD-PARTY-NOTICES.txt'),notices.join('\n\n'));
await fs.copyFile(path.join(llvm,'sysroot/usr/lib',sysrootArch,'libc++_shared.so'),path.join(lib,'libc++_shared.so'));
await run(path.join(llvm,'bin',exe('clang++')),['--target='+compilerTarget,'--sysroot='+path.join(llvm,'sysroot'),'-shared','-fPIC','-std=c++17','-Wl,-z,max-page-size=16384',path.join(root,'android/native.cpp'),'-L'+lib,'-lnode','-o',path.join(lib,'libhasimio.so')]);

const resources=path.join(work,'res');await fs.cp(path.join(root,'android/res'),resources,{recursive:true});await fs.mkdir(path.join(resources,'drawable'),{recursive:true});await fs.writeFile(path.join(resources,'drawable/icon.png'),icon(192));
const compiled=path.join(work,'resources.zip');
await run(path.join(tools,exe('aapt2')),['compile','--dir',resources,'-o',compiled]);
const base=path.join(work,'base.apk');
await run(path.join(tools,exe('aapt2')),['link','-o',base,'-I',jar,'--manifest',path.join(root,'android/AndroidManifest.xml'),'--version-code',String(code),'--version-name',pkg.version,compiled]);
const generated=path.join(work,'java/app/hasimio/android');await fs.mkdir(generated,{recursive:true});
await fs.writeFile(path.join(generated,'BuildConfig.java'),`package app.hasimio.android; final class BuildConfig { static final String VERSION_NAME="${pkg.version}"; static final int VERSION_CODE=${code}; }\n`);
const classes=path.join(work,'classes'),dex=path.join(work,'dex');await fs.mkdir(classes,{recursive:true});await fs.mkdir(dex,{recursive:true});
const sources=(await fs.readdir(path.join(root,'android/java/app/hasimio/android'))).filter(name=>name.endsWith('.java')).map(name=>path.join(root,'android/java/app/hasimio/android',name));
await run(java('javac'),['--release','17','-classpath',jar,'-d',classes,...sources,path.join(generated,'BuildConfig.java')]);
async function files(directory){const result=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const name=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await files(name));else result.push(name);}return result;}
await run(java('java'),['-cp',path.join(tools,'lib/d8.jar'),'com.android.tools.r8.D8','--min-api','28','--lib',jar,'--output',dex,...(await files(classes)).filter(name=>name.endsWith('.class'))]);
const entries=unzipSync(await fs.readFile(base));
for(const directory of [path.join(work,'assets'),path.join(work,'lib')])for(const file of await files(directory))entries[path.relative(work,file).replaceAll('\\','/')]=await fs.readFile(file);
for(const file of await files(dex))entries[path.basename(file)]=await fs.readFile(file);
// Android 11+ rejects a compressed resources.arsc, even with a valid signature.
// Preserve it as a stored ZIP entry so zipalign can align its data to 4 bytes.
entries['resources.arsc']=[entries['resources.arsc'],{level:0}];
const unsigned=path.join(work,'unsigned.apk'),aligned=path.join(work,'aligned.apk');await fs.writeFile(unsigned,zipSync(entries,{level:6}));
await run(path.join(tools,exe('zipalign')),['-f','4',unsigned,aligned]);
let key=process.env.ANDROID_KEYSTORE,alias=process.env.ANDROID_KEY_ALIAS||'hasimio',storePassword=process.env.ANDROID_KEYSTORE_PASSWORD,keyPassword=process.env.ANDROID_KEY_PASSWORD||storePassword;
if(!key){
  if(process.env.CI)throw Error('CI release builds require ANDROID_KEYSTORE and signing passwords.');
  const directory=path.join(cache,'signing');await fs.mkdir(directory,{recursive:true});
  const configFile=path.join(directory,'local-key.json');let config;
  try{config=JSON.parse(await fs.readFile(configFile,'utf8'));}catch{
    config={password:crypto.randomBytes(24).toString('hex')};await fs.writeFile(configFile,JSON.stringify(config),{mode:0o600});
  }
  key=path.join(directory,'hasimio.jks');storePassword=keyPassword=config.password;
  try{await fs.access(key);}catch{await run(java('keytool'),['-genkeypair','-keystore',key,'-storepass:env','HASIMIO_SIGN_STORE','-keypass:env','HASIMIO_SIGN_KEY','-alias',alias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Hasimio Android','-storetype','JKS'],{HASIMIO_SIGN_STORE:storePassword,HASIMIO_SIGN_KEY:keyPassword});}
  console.log('Using persistent local signing key in .cache/android/signing. Back it up before publishing.');
}
if(!storePassword||!keyPassword)throw Error('Android signing passwords are missing.');
const apk=path.join(output,`Hasimio-${pkg.version}-android-${suffix}.apk`);
await run(java('java'),['-jar',path.join(tools,'lib/apksigner.jar'),'sign','--ks',path.resolve(key),'--ks-key-alias',alias,'--ks-pass','env:HASIMIO_SIGN_STORE','--key-pass','env:HASIMIO_SIGN_KEY','--out',apk,aligned],{HASIMIO_SIGN_STORE:storePassword,HASIMIO_SIGN_KEY:keyPassword});
// Check the final signed archive, rather than assuming successful ZIP creation
// or zipalign means Android's installer will accept the resource table.
const signed=await fs.readFile(apk);
let end=signed.length-22;
while(end>=Math.max(0,signed.length-65557)&&signed.readUInt32LE(end)!==0x06054b50)end--;
if(end<0||signed.readUInt32LE(end)!==0x06054b50)throw Error('APK ZIP directory is missing.');
let directory=signed.readUInt32LE(end+16),foundResources=false;
for(let i=0;i<signed.readUInt16LE(end+10);i++){
  if(signed.readUInt32LE(directory)!==0x02014b50)throw Error('Invalid APK ZIP directory.');
  const nameLength=signed.readUInt16LE(directory+28),extraLength=signed.readUInt16LE(directory+30),commentLength=signed.readUInt16LE(directory+32);
  if(signed.subarray(directory+46,directory+46+nameLength).toString()==='resources.arsc'){
    const local=signed.readUInt32LE(directory+42);
    const offset=local+30+signed.readUInt16LE(local+26)+signed.readUInt16LE(local+28);
    if(signed.readUInt16LE(directory+10)!==0||offset%4!==0)throw Error('Android requires resources.arsc to be stored uncompressed and aligned to 4 bytes.');
    foundResources=true;
  }
  directory+=46+nameLength+extraLength+commentLength;
}
if(!foundResources)throw Error('APK is missing resources.arsc.');
await run(java('java'),['-jar',path.join(tools,'lib/apksigner.jar'),'verify',apk]);
const sha256=crypto.createHash('sha256').update(await fs.readFile(apk)).digest('hex');
await fs.writeFile(path.join(output,updateManifest),JSON.stringify({version:pkg.version,versionCode:code,apk:path.basename(apk),sha256},null,2)+'\n');
console.log('Created '+apk);
