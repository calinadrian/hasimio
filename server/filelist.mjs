import fs from 'fs';
import path from 'path';
import {parseVideoId,sizeLabel} from './piratebay.mjs';
import {detectQuality,detectCodec} from '../shared/stream-info.mjs';

export {filelistManifest} from '../shared/filelist-manifest.mjs';
function mkdir(directory){if(fs.existsSync(directory))return;mkdir(path.dirname(directory));try{fs.mkdirSync(directory,0o700);}catch(error){if(error.code!=='EEXIST')throw error;}}
async function bytes(response,limit){
  if(Number(response.headers.get('content-length'))>limit)throw Error('FileList response exceeds the memory limit.');
  if(response.body&&response.body.getReader){
    const reader=response.body.getReader(),parts=[];let size=0;
    try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>limit)throw Error('FileList response exceeds the memory limit.');parts.push(Buffer.from(next.value));}return Buffer.concat(parts,size);}
    finally{await reader.cancel();}
  }
  const value=Buffer.from(await response.arrayBuffer());if(value.length>limit)throw Error('FileList response exceeds the memory limit.');return value;
}
export function createFileList({filename,fetchImpl=(...args)=>fetch(...args),parseTorrent}){
  let account,revision=0,used=[],cache=new Map(),pending=new Map(),connecting;
  const cacheLimit=128*1024;
  try{const saved=JSON.parse(fs.readFileSync(filename,'utf8'));if(typeof saved.username==='string'&&typeof saved.passkey==='string')account=saved;}catch{/* Not connected yet. */}
  const status=()=>({configured:Boolean(account),username:account&&account.username});
  function allowance(){const now=Date.now();used=used.filter(time=>now-time<3600000);if(used.length>=70)throw Error('FileList request budget reached. Wait before searching again.');used.push(now);}
  async function request(url,credentials,limit){
    let response;
    try{response=await fetchImpl(url,{headers:{Authorization:'Basic '+Buffer.from(credentials.username+':'+credentials.passkey).toString('base64')},signal:AbortSignal.timeout(15000),redirect:'error'});}
    catch{throw Error('FileList could not be reached.');}
    if(!response.ok)throw Error(response.status===401||response.status===403?'FileList rejected access. Check your username, API passkey and account API access.':response.status===429?'FileList rate limit reached. Try again later.':'FileList returned HTTP '+response.status+'.');
    return bytes(response,limit);
  }
  async function api(parameters,credentials){
    allowance();const url=new URL('https://filelist.io/api.php');url.search=new URLSearchParams(parameters).toString();
    let result;try{result=JSON.parse((await request(url.href,credentials,2*1024*1024)).toString('utf8'));}catch(error){if(error instanceof SyntaxError)throw Error('FileList did not return API data. Check account API access.');throw error;}
    if(!Array.isArray(result))throw Error('FileList rejected the API request. Check your account API access.');return result;
  }
  async function connect(input){
    if(connecting)throw Error('A FileList connection is already in progress.');
    if(typeof input.username!=='string'||!input.username.trim()||input.username.length>100||/[\r\n:]/.test(input.username)||typeof input.passkey!=='string'||!input.passkey.trim()||input.passkey.length>256||/[\r\n]/.test(input.passkey))throw Error('Enter your FileList username and API passkey.');
    const candidate={username:input.username.trim(),passkey:input.passkey.trim()},current=revision;
    connecting=true;
    try{
      await api({action:'latest-torrents'},candidate);
      if(revision!==current)throw Error('FileList connection was cancelled.');
      mkdir(path.dirname(filename));const temporary=filename+'.tmp';fs.writeFileSync(temporary,JSON.stringify(candidate),{mode:0o600});fs.renameSync(temporary,filename);
      account=candidate;revision++;cache.clear();return status();
    }finally{connecting=false;}
  }
  function disconnect(){account=undefined;revision++;cache.clear();try{fs.unlinkSync(filename);}catch(error){if(error.code!=='ENOENT')throw Error('Could not remove the saved FileList account.');}return status();}
  async function search(type,id){
    if(!account)return {streams:[]};
    const video=parseVideoId(type,id);if(!video.imdb)throw Error('FileList supports IMDb movies and specific series episodes.');
    const key=revision+':'+type+':'+id,found=cache.get(key);if(found&&found.expires>Date.now())return found.value;
    if(pending.has(key))return pending.get(key);if(pending.size>=4)throw Error('FileList is busy. Retry shortly.');
    const credentials=account,current=revision;
    const task=(async()=>{
      const parameters={action:'search-torrents',type:'imdb',query:video.imdb};
      if(type==='series'){parameters.season=String(video.season);parameters.episode=String(video.episode);}
      const rows=await api(parameters,credentials);
      if(current!==revision)return {streams:[]};
      const episode=type==='series'?new RegExp('(?:s0*'+video.season+'[ ._-]*e0*'+video.episode+'(?!\\d)|\\b'+video.season+'x0*'+video.episode+'(?!\\d))','i'):undefined;
      const seasonPack=type==='series'?new RegExp('(?:\\bs0*'+video.season+'(?!\\d)(?![ ._-]*e\\d)|\\bseason[ ._-]*0*'+video.season+'(?!\\d))','i'):undefined;
      const streams=rows.filter(row=>row&&Number.isSafeInteger(Number(row.id))&&Number(row.id)>0&&typeof row.name==='string'&&(!row.imdb||String(row.imdb).replace(/^tt/,'')===video.imdb.slice(2))&&(!episode||episode.test(row.name)||seasonPack.test(row.name))).sort((a,b)=>Number(b.seeders)-Number(a.seeders)).slice(0,30).map(row=>{
        const title=row.name.slice(0,300),quality=detectQuality(title),seeders=Math.max(0,Number(row.seeders)||0),sizeBytes=Math.max(0,Number(row.size)||0);
        return {filelistId:String(row.id),provider:'FileList',name:'FileList · '+quality,filename:title,quality,codec:detectCodec(title),seeders,sizeBytes,title:title+'\n'+seeders+' seeders · '+sizeLabel(sizeBytes)};
      });
      const value={streams},size=Buffer.byteLength(JSON.stringify(value));
      if(size<=cacheLimit){while(cache.size&&(cache.size>=12||Array.from(cache.values()).reduce((sum,item)=>sum+item.size,0)+size>cacheLimit))cache.delete(cache.keys().next().value);cache.set(key,{expires:Date.now()+300000,value,size});}return value;
    })();
    pending.set(key,task);try{return await task;}finally{pending.delete(key);}
  }
  async function resolve(id){
    if(!account)throw Error('Connect FileList in Extensions first.');
    if(!/^[1-9]\d{0,11}$/.test(String(id)))throw Error('Invalid FileList torrent.');
    const credentials=account,current=revision;
    const url=new URL('https://filelist.io/download.php');url.search=new URLSearchParams({id:String(id),passkey:credentials.passkey}).toString();
    const data=await request(url.href,credentials,1024*1024);
    if(current!==revision)throw Error('FileList account changed. Choose the source again.');
    let parsed;try{parsed=await parseTorrent(data);}catch{throw Error('FileList did not return a valid torrent file.');}
    if(!parsed.private||!Array.isArray(parsed.announce)||!parsed.announce.length)throw Error('FileList returned a torrent without private tracker metadata.');
    return {data,infoHash:parsed.infoHash};
  }
  return {status,connect,disconnect,search,resolve};
}
