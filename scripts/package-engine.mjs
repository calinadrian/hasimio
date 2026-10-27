// Builds release/Hasimio-Engine-<version>-win-x64.zip: a portable Hasimio Engine with its own Node.js runtime and FFmpeg.
// node scripts/package-engine.mjs [--allow-origin https://hasimio.example]... [--node C:\path\to\node.exe] [--no-zip]
import {cp,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseOrigins} from '../server/torrent-utils.mjs';
import {ENGINE_PORT} from '../server/engine.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
// Packages the engine imports directly; everything they need is found from their package.json files.
export const ENGINE_PACKAGES=['webtorrent','ffmpeg-static'];

// Resolves like Node: the nearest node_modules folder from the requiring package upward, stopping at the project root.
function locate(name,fromDir) {
  for(let dir=fromDir;;dir=path.dirname(dir)){
    const candidate=path.join(dir,'node_modules',name);
    if(existsSync(path.join(candidate,'package.json')))return candidate;
    if(path.resolve(dir)===path.resolve(root)||path.dirname(dir)===dir)return undefined;
  }
}
// Returns the top-level node_modules folders to copy. Nested node_modules come along with their parent folder.
export async function dependencyFolders(entries=ENGINE_PACKAGES,projectRoot=root) {
  const seen=new Set(),topLevel=new Set(),queue=entries.map(name=>({name,from:projectRoot,optional:false}));
  while(queue.length){
    const {name,from,optional}=queue.shift();
    const folder=locate(name,from);
    if(!folder){if(optional)continue;throw new Error(`${name} is required by ${path.relative(projectRoot,from)||'the engine'} but is not installed. Run npm install first.`);}
    if(seen.has(folder))continue;seen.add(folder);
    const top=path.relative(path.join(projectRoot,'node_modules'),folder).split(path.sep);
    topLevel.add(top[0].startsWith('@')?`${top[0]}/${top[1]}`:top[0]);
    const manifest=JSON.parse(await readFile(path.join(folder,'package.json'),'utf8'));
    for(const dep of Object.keys(manifest.dependencies??{}))queue.push({name:dep,from:folder,optional:false});
    for(const dep of [...Object.keys(manifest.optionalDependencies??{}),...Object.keys(manifest.peerDependencies??{})])queue.push({name:dep,from:folder,optional:true});
  }
  return [...topLevel].sort();
}

export function launcherScript() {
  return ['@echo off','title Hasimio Engine','cd /d "%~dp0"','"%~dp0runtime\\node.exe" "%~dp0app\\server\\engine.mjs" --config "%~dp0engine.json" %*','if errorlevel 1 pause',''].join('\r\n');
}
function readme(version,nodeVersion,origins) {
  return `Hasimio Engine ${version}
======================

Hasimio Engine lets the Hasimio website play torrents. Torrents download to this PC
and stream to your browser from here. Nothing is sent through the website.

Start
  Double-click "Hasimio Engine.cmd". A window opens; keep it open while you watch.
  Then open the Hasimio website. It finds the engine on its own.

Stop
  Press Ctrl+C in the engine window, or close the window.

Allowed websites
  Only the sites listed in engine.json can use the engine:
    ${origins.length?origins.join('\n    '):'(none yet: add your Hasimio site to "allowedOrigins")'}
  Edit engine.json to add a site, for example:
    { "allowedOrigins": ["https://hasimio.example"], "port": ${ENGINE_PORT}, "lan": false }
  "lan": true also lets other devices on your home network connect.

Temporary files
  %LOCALAPPDATA%\\Hasimio\\cache. Files are removed when playback stops.

Notes
  - The engine listens on http://127.0.0.1:${ENGINE_PORT} and refuses other computers.
  - Torrenting shares data with peers and shows them your IP address.
  - If Windows warns that the file came from the internet, right-click the zip,
    choose Properties, tick Unblock, and extract it again.

Included software
  Node.js ${nodeVersion} (runtime\\node.exe), MIT license: https://github.com/nodejs/node/blob/main/LICENSE
  FFmpeg via ffmpeg-static (app\\node_modules\\ffmpeg-static), see ffmpeg.exe.LICENSE and ffmpeg.exe.README there.
  WebTorrent and its dependencies (app\\node_modules), each with its own license file.
`.replace(/\n/g,'\r\n');
}

async function folderSize(dir) {let total=0;for(const entry of await readdir(dir,{withFileTypes:true,recursive:true}))if(entry.isFile())total+=(await stat(path.join(entry.parentPath,entry.name))).size;return total;}

async function main(argv) {
  const origins=[];let nodePath=process.execPath,zip=true;
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--allow-origin')origins.push(argv[++i]??'');
    else if(argv[i]==='--node')nodePath=argv[++i];
    else if(argv[i]==='--no-zip')zip=false;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  const allowed=[...parseOrigins(origins.join(','))];
  if(process.platform!=='win32')throw new Error('The Windows package must be built on Windows, so the bundled node.exe and ffmpeg.exe match.');
  if(!nodePath||!existsSync(nodePath))throw new Error(`Node.js runtime not found: ${nodePath}`);
  const {stdout}=await promisify(execFile)(nodePath,['-p','process.version+" "+process.arch']);const [nodeVersion,arch]=stdout.trim().split(' ');
  if(arch!=='x64')throw new Error(`The bundled runtime must be x64; ${nodePath} is ${arch}.`);
  if(Number(nodeVersion.slice(1).split('.')[0])<22)throw new Error(`The bundled runtime needs Node.js 22 or newer; ${nodePath} is ${nodeVersion}.`);
  const project=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  const name=`Hasimio-Engine-${project.version}-win-x64`,release=path.join(root,'release'),out=path.join(release,name),app=path.join(out,'app');
  await rm(out,{recursive:true,force:true});await mkdir(path.join(out,'runtime'),{recursive:true});
  await cp(nodePath,path.join(out,'runtime','node.exe'));
  const runtimeOnly=file=>!/\.(test\.js|d\.mts)$/.test(file)&&path.basename(file)!=='smoke.mjs';
  for(const folder of ['server','shared'])for(const file of (await readdir(path.join(root,folder))).filter(f=>f.endsWith('.mjs')&&runtimeOnly(f)))await cp(path.join(root,folder,file),path.join(app,folder,file));
  await writeFile(path.join(app,'package.json'),JSON.stringify({name:'hasimio-engine',version:project.version,private:true,type:'module'},null,2)+'\n');
  const packages=await dependencyFolders();
  for(const pkg of packages)await cp(path.join(root,'node_modules',pkg),path.join(app,'node_modules',pkg),{recursive:true});
  if(!existsSync(path.join(app,'node_modules','ffmpeg-static','ffmpeg.exe')))throw new Error('ffmpeg-static has no ffmpeg.exe. Reinstall it with npm install ffmpeg-static.');
  await writeFile(path.join(out,'engine.json'),JSON.stringify({allowedOrigins:allowed,port:ENGINE_PORT,lan:false},null,2)+'\n');
  await writeFile(path.join(out,'Hasimio Engine.cmd'),launcherScript());
  await writeFile(path.join(out,'README.txt'),readme(project.version,nodeVersion,allowed));
  console.log(`Staged ${name}: Node.js ${nodeVersion}, ${packages.length} packages, ${(await folderSize(out)/1024/1024).toFixed(0)} MB`);
  if(zip){
    const archive=path.join(release,`${name}.zip`);await rm(archive,{force:true});
    // Windows' bsdtar writes zip archives; Git's GNU tar does not, so call it by full path.
    await promisify(execFile)(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-a','-c','-f',archive,'-C',release,name],{maxBuffer:64*1024*1024});
    console.log(`Wrote ${path.relative(root,archive)} (${((await stat(archive)).size/1024/1024).toFixed(0)} MB)`);
  }
  if(!allowed.length)console.log('No allowed sites yet. Pass --allow-origin https://your-site, or edit engine.json in the package.');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exit(1);});
