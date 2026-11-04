import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {pruneReleases} from './release-presentation.mjs';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const format=require('../webos/service/update-format.cjs');
const repository='calinadrian/hasimio';
const output=path.join(root,'release','webos');
const payloadRoot=path.join(output,'staging','service','bundled');
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(!format.version(version))throw Error('The TV updater needs a three-part release version.');
const tag='webos-v'+version;
const gh=process.env.GH_CLI||'gh';
async function run(command,args,{capture=false,optional=false}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,windowsHide:true,stdio:capture?['ignore','pipe','pipe']:'inherit'});let stdout='',stderr='';
    if(capture){child.stdout.on('data',part=>stdout+=part);child.stderr.on('data',part=>stderr+=part);}
    child.once('error',error=>optional?resolve(undefined):reject(error));
    child.once('exit',code=>code===0?resolve(stdout.trim()):optional?resolve(undefined):reject(Error(stderr||command+' failed (exit '+code+').')));
  });
}
await run(gh,['api','user','--jq','.login'],{capture:true});
if(await run('git',['status','--porcelain'],{capture:true}))throw Error('Commit the TV source before publishing so the release matches its tag.');
const branch=await run('git',['branch','--show-current'],{capture:true});if(!branch)throw Error('Check out a branch before publishing.');
const existing=await run(gh,['release','view',tag,'--repo',repository,'--json','isDraft'],{capture:true,optional:true});
if(existing&&!JSON.parse(existing).isDraft)throw Error(tag+' is already published. Bump package.json before releasing another TV update.');
const privateKey=await fs.readFile(process.env.HASIMIO_WEBOS_SIGNING_KEY_FILE||path.join(root,'.cache','webos-update-signing-key.pem'),'utf8');
const publicKey=await fs.readFile(path.join(root,'webos','update-public-key.pem'),'utf8');
if(crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'}).trim()!==crypto.createPublicKey(publicKey).export({type:'spki',format:'pem'}).trim())throw Error('The signing key does not match the public key trusted by installed TVs.');
await run(process.execPath,[path.join(root,'scripts','package-webos.mjs')]);
async function collect(folder,prefix=''){
  const result=[];
  for(const name of (await fs.readdir(folder)).sort()){
    const filename=path.join(folder,name),relative=prefix+name,stat=await fs.lstat(filename);
    if(stat.isSymbolicLink())throw Error('Symlinks cannot be included in a TV update.');
    if(stat.isDirectory())result.push(...await collect(filename,relative+'/'));
    else{if(!format.allowed(relative))throw Error('Unexpected TV update file: '+relative);const data=await fs.readFile(filename);result.push({path:relative,data});}
  }
  return result;
}
const files=await collect(payloadRoot);
const raw=Buffer.from(JSON.stringify(files.map(file=>({path:file.path,data:file.data.toString('base64')}))));
const compressed=zlib.gzipSync(raw,{level:9});
const manifest={schema:1,launcherApi:1,appId:'app.hasimio.tv',version,sourceCommit:await run('git',['rev-parse','HEAD'],{capture:true}),payload:{name:'hasimio-webos-update.json.gz',size:compressed.length,unpackedSize:raw.length,sha256:format.sha256(compressed)},files:files.map(file=>({path:file.path,size:file.data.length,sha256:format.sha256(file.data)}))};
const text=JSON.stringify(manifest,null,2)+'\n';
const signer=crypto.createSign('RSA-SHA256');signer.update(text);const signature=signer.sign(privateKey);
format.verify(text,signature,publicKey);
const manifestFile=path.join(output,'hasimio-webos-update.json'),signatureFile=path.join(output,'hasimio-webos-update.sig'),payloadFile=path.join(output,manifest.payload.name);
await fs.writeFile(manifestFile,text);await fs.writeFile(signatureFile,signature);await fs.writeFile(payloadFile,compressed);
const notesFile=path.join(output,'release-notes.md');
await fs.copyFile(path.join(root,'webos','release-notes.md'),notesFile);
const assets=[path.join(output,'app.hasimio.tv_'+version+'_all.ipk'),manifestFile,signatureFile,payloadFile,path.join(output,'INSTALL.txt')];
for(const file of assets)if(!(await fs.stat(file)).size)throw Error('Missing release asset: '+path.basename(file));
const previousTag=await run('git',['tag','--list',tag],{capture:true});
if(previousTag){if(await run('git',['rev-parse',tag+'^{commit}'],{capture:true})!==manifest.sourceCommit)throw Error('The TV release tag points to a different commit. Bump the version.');}
else await run('git',['tag','-a',tag,'-m','Hasimio TV '+version]);
await run('git',['push','-u','origin','HEAD:refs/heads/'+branch,'refs/tags/'+tag]);
if(!existing)await run(gh,['release','create',tag,'--repo',repository,'--draft','--verify-tag','--title','Hasimio TV '+version,'--notes-file',notesFile,'--latest=false']);
await run(gh,['release','upload',tag,...assets,'--repo',repository,'--clobber']);
// Keep TV releases out of the Windows updater's "latest release" channel.
await run(gh,['release','edit',tag,'--repo',repository,'--draft=false','--latest=false','--notes-file',notesFile]);
pruneReleases('webos',{gh,repository});
console.log('Published TV installer and signed updates: https://github.com/'+repository+'/releases/tag/'+tag);
