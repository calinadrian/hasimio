// Build and package only. This never starts the service, launches a browser or
// connects to a TV. Install the resulting IPK with LG's Developer Mode tools.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {rootCertificates} from 'node:tls';
import {build as buildVite} from 'vite';
import react from '@vitejs/plugin-react';
import {build as buildService,transform as transformService} from 'esbuild';
import rewritePattern from 'regexpu-core';
import {icon} from './make-icon.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const output=path.join(root,'release','webos');
const staging=path.join(output,'staging');
// The TV service pins its own older dependencies for the TV's Node 8. Without them the bundler
// falls back to the desktop copies and fails with unrelated-looking syntax errors.
const servicePins=JSON.parse(await fs.readFile(path.join(root,'webos','service','package.json'),'utf8')).dependencies;
for(const [name,version] of Object.entries(servicePins)){
  const installed=await fs.readFile(path.join(root,'webos','service','node_modules',name,'package.json'),'utf8').then(text=>JSON.parse(text).version,()=>undefined);
  if(installed!==version)throw Error('TV service dependency '+name+' '+version+' is '+(installed?'at '+installed:'not installed')+'. Run: npm ci --prefix webos/service --omit=optional --ignore-scripts');
}
const app=path.join(staging,'app'),service=path.join(staging,'service');
const bundled=path.join(service,'bundled');
const www=path.join(bundled,'www');
const prepared=process.argv.includes('--prepare-only');

async function run(command,args){await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Build command failed (exit '+code+').')));});}
// A clean staging folder prevents stale files from accidentally being shipped.
if(!staging.startsWith(path.join(root,'release')+path.sep))throw Error('Invalid staging directory.');
await fs.rm(staging,{recursive:true,force:true});
await fs.mkdir(staging,{recursive:true});
await fs.cp(path.join(root,'webos','app'),app,{recursive:true});
await fs.mkdir(service,{recursive:true});
await run(process.execPath,[require.resolve('typescript/bin/tsc'),'-b']);
await buildVite({
  root,configFile:false,plugins:[react()],
  css:{postcss:{plugins:[{postcssPlugin:'tv-layout-fallbacks',Declaration(declaration){
    declaration.value=declaration.value.replace(/\b(\d*\.?\d+)[dsl]vh\b/g,'$1vh');
    if(declaration.prop==='inset'&&!declaration.value.includes('(')){
      const values=declaration.value.trim().split(/\s+/);
      if(values.length<1||values.length>4)return;
      const [top,right=top,bottom=top,left=right]=values;
      for(const [prop,value] of Object.entries({top,right,bottom,left}))declaration.cloneBefore({prop,value});
      declaration.remove();
    }
  }}]}},
  define:{'import.meta.env.VITE_WEBOS':'"true"','import.meta.env.VITE_ENGINE_URL':'undefined'},
  build:{outDir:www,emptyOutDir:true,target:'chrome79',cssTarget:'chrome79',rollupOptions:{input:path.join(root,'webos.html')}}
});
await fs.rename(path.join(www,'webos.html'),path.join(www,'index.html'));
const appInfo=JSON.parse(await fs.readFile(path.join(app,'appinfo.json'),'utf8'));appInfo.version=pkg.version;
await fs.writeFile(path.join(app,'appinfo.json'),JSON.stringify(appInfo,null,2)+'\n');
await fs.writeFile(path.join(app,'icon.png'),icon(80));
await fs.writeFile(path.join(app,'largeIcon.png'),icon(130));
await fs.writeFile(path.join(service,'package.json'),JSON.stringify({name:'app.hasimio.tv.service',version:pkg.version,main:'launcher.js'},null,2)+'\n');
await fs.copyFile(path.join(root,'webos','service','services.json'),path.join(service,'services.json'));
// The stable launcher runs before the bundled service. It and its helper must
// target Node 8 too; copying them verbatim leaves unsupported syntax behind.
async function writeLauncher(source,destination){
  const text=(await fs.readFile(path.join(root,'webos','service',source),'utf8')).replace('__HASIMIO_VERSION__',pkg.version);
  const result=await transformService(text,{loader:'js',target:'node8',format:'cjs',sourcefile:source});
  await fs.writeFile(path.join(service,destination),result.code);
}
await writeLauncher('update-format.cjs','update-format.cjs');
await fs.copyFile(path.join(root,'webos','update-public-key.pem'),path.join(service,'update-public-key.pem'));
await writeLauncher('launcher.cjs','launcher.js');
await fs.writeFile(path.join(bundled,'ca.pem'),rootCertificates.join('\n')+'\n');

const result=await buildService({
  absWorkingDir:root,entryPoints:['webos/service/main.cjs'],outfile:path.join(bundled,'service.bundle.js'),
  // node-fetch 2 identifies AbortSignal by constructor.name. Renaming the
  // polyfill class makes every request with a cancellation signal fail.
  bundle:true,platform:'node',target:'node8',format:'cjs',minify:true,keepNames:true,metafile:true,
  define:{HASIMIO_VERSION:JSON.stringify(pkg.version)},external:['webos-service'],
  plugins:[{
    name:'webos-node8',setup(build){
      build.onResolve({filter:/^node:/},args=>({path:args.path.slice(5),external:true}));
      // No native optional modules, filesystem torrent stores, or unused seed
      // and browser-rendering features are needed in the TV service.
      build.onResolve({filter:/^(bufferutil|utf-8-validate|fs-chunk-store|load-ip-set|create-torrent|render-media)$/},args=>({path:args.path,namespace:'tv-stub'}));
      build.onLoad({filter:/.*/,namespace:'tv-stub'},args=>({contents:args.path==='load-ip-set'?'module.exports=null;':'module.exports=function(){throw new Error("This module is not used by the TV player.");};',loader:'js'}));
      build.onLoad({filter:/\.(mjs|cjs|js)$/},async args=>{
        let contents=await fs.readFile(args.path,'utf8');
        // Node 8 supports Unicode regex flags, but not Unicode properties.
        contents=contents.replace(/\/([\[][\^]\\p\{L\}\\p\{N\} ?\]\+?)\/gu/g,(_,pattern)=>'/'+rewritePattern(pattern,'gu',{unicodePropertyEscapes:'transform'})+'/gu');
        if(/\\[pP]\{/.test(contents))throw Error('Review unsupported Unicode property escapes for the TV: '+args.path);
        if(args.path.replaceAll('\\','/').endsWith('/webtorrent/lib/torrent.js')){
          const needle='this.store = new ImmediateChunkStore(';
          if(!contents.includes(needle))throw Error('WebTorrent changed: review the TV metadata guard before packaging.');
          contents=contents.replace(needle,'if(!Number.isSafeInteger(this.pieceLength)||this.pieceLength<1||this.pieceLength>4*1024*1024||this.pieces.length>32768||this.files.length>1000){this._destroy(new Error("This torrent exceeds the TV metadata budget. Choose another source."));return;}\n'+needle);
        }
        if(args.path.replaceAll('\\','/').endsWith('/server/eztv.mjs')){
          contents=contents.replace('if(pages>100)','if(pages>10)').replace('Math.min(3,Math.max(0,pages-1))','Math.min(1,Math.max(0,pages-1))');
        }
        return {contents,loader:'js',resolveDir:path.dirname(args.path)};
      });
    }
  }]
});

// Preserve upstream notices for every bundled service dependency, plus the
// primary UI libraries. Build tools are not shipped in the IPK.
const packages=new Set();
for(const input of Object.keys(result.metafile.inputs)){
  if(!input.includes('node_modules'))continue;
  let directory=path.dirname(path.resolve(root,input));
  while(directory!==path.dirname(directory)){
    try{await fs.access(path.join(directory,'package.json'));packages.add(directory);break;}catch{directory=path.dirname(directory);}
  }
}
for(const name of ['react','react-dom','scheduler','lucide-react','hls.js','fflate','core-js','dialog-polyfill','qrcode']){
  try{packages.add(path.dirname(require.resolve(name+'/package.json')));}catch{/* A dependency may be tree-shaken away. */}
}
const notices=[];
for(const directory of [...packages].sort()){
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'package.json'),'utf8'));
  notices.push('\n'+manifest.name+' '+manifest.version+' ('+(manifest.license||'see upstream')+')\n');
  for(const file of await fs.readdir(directory))if(/^(license|licence|copying|notice)(\.|$)/i.test(file)){
    const filename=path.join(directory,file);if((await fs.stat(filename)).isFile())notices.push(await fs.readFile(filename,'utf8'));
  }
}
await fs.writeFile(path.join(bundled,'THIRD-PARTY-NOTICES.txt'),notices.join('\n'));
await fs.copyFile(path.join(root,'webos','INSTALL.md'),path.join(output,'INSTALL.txt'));
if(!prepared){
  const cliCandidates=[process.env.HASIMIO_WEBOS_CLI,process.env.APPDATA&&path.join(process.env.APPDATA,'npm','node_modules','@webos-tools','cli','bin','ares-package.js')].filter(Boolean);
  let cli;for(const candidate of cliCandidates){try{await fs.access(candidate);cli=candidate;break;}catch{/* Try next known CLI location. */}}
  if(!cli)throw Error('The TV build is prepared. Install @webos-tools/cli, or set HASIMIO_WEBOS_CLI to its ares-package.js path, then run npm run package:webos again.');
  // Vite/esbuild have already minified the code. LG's older minifier need not
  // parse it again, and --no-minify also preserves the bundled notices.
  await run(process.execPath,[cli,app,service,'--no-minify','-o',output]);
}
async function size(directory){let bytes=0;for(const entry of await fs.readdir(directory,{withFileTypes:true})){const filename=path.join(directory,entry.name);bytes+=entry.isDirectory()?await size(filename):(await fs.stat(filename)).size;}return bytes;}
console.log('Standalone TV files: '+((await size(staging))/1048576).toFixed(2)+' MiB. '+(prepared?'Prepared only.':'IPK written to '+output));
