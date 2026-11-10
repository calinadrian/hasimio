// Check the official English and Romanian playlists against the main playlist
// and decode real video through Hasimio's proxy. A successful HTTP playlist fetch is insufficient.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import ffmpeg from 'ffmpeg-static';
import {createIptvOrg,parseIptvPlaylist} from '../server/iptv-org.mjs';

const directory=new URL('../.cache/iptv-org-audit/',import.meta.url);
await mkdir(directory,{recursive:true});
const args=new Set(process.argv.slice(2));
async function playlist(name,url){
  if(!args.has('--download'))return readFile(new URL(name,directory),'utf8');
  const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('Playlist download failed: '+response.status);
  const text=await response.text();await writeFile(new URL(name,directory),text);return text;
}
const source='https://iptv-org.github.io/iptv/index.m3u';
const languageSources={eng:'https://iptv-org.github.io/iptv/languages/eng.m3u',ron:'https://iptv-org.github.io/iptv/languages/ron.m3u'};
const [index,english,romanian]=await Promise.all([
  playlist('index.m3u',source),
  playlist('english.m3u',languageSources.eng),
  playlist('romanian.m3u',languageSources.ron),
]);
const all=parseIptvPlaylist(index);
const languageByStream=new Map();
for(const [language,text] of [['eng',english],['ron',romanian]])for(const channel of parseIptvPlaylist(text))for(const server of channel.servers){
  if(!languageByStream.has(server.url))languageByStream.set(server.url,new Set());
  languageByStream.get(server.url).add(language);
}
const candidates=all.map(channel=>{const servers=channel.servers.filter(server=>languageByStream.has(server.url));return {...channel,servers,language:[...new Set(servers.flatMap(server=>[...languageByStream.get(server.url)]))].sort().join('+')};}).filter(channel=>channel.servers.length);
const tasks=[...new Map(candidates.flatMap(channel=>channel.servers.map(server=>[server.url,{channel,server}]))).values()];
const fingerprint=createHash('sha256').update(index).update(english).update(romanian).digest('hex');
const byLanguage=language=>candidates.filter(channel=>channel.language.includes(language)).length;
console.log(JSON.stringify({totalChannels:all.length,totalStreams:all.reduce((sum,channel)=>sum+channel.servers.length,0),englishChannels:byLanguage('eng'),romanianChannels:byLanguage('ron'),selectedChannels:candidates.length,selectedStreams:tasks.length}));
if(args.has('--prepare-only'))process.exit(0);
let results={};
if(args.has('--resume'))try{const previous=JSON.parse(await readFile(new URL('report.json',directory),'utf8'));if(previous.fingerprint===fingerprint)results=previous.results;}catch{}
const startedAt=new Date().toISOString();
const proxy=createIptvOrg({catalogChannels:candidates});
const server=createServer(async(req,res)=>{
  const route=/^\/api\/live-tv\/([a-z0-9-]+)\/(s[1-9][0-9]*)\/(index\.m3u8|asset\/[a-f0-9]{32})$/.exec(new URL(req.url,'http://localhost').pathname);
  if(!route){res.writeHead(404);res.end();return;}
  const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
  try{const output=await proxy.resource(route[1],route[2],route[3].replace('asset/',''),controller.signal);res.writeHead(200,{'Content-Type':output.type});res.end(output.body);}
  catch(error){if(!res.destroyed){res.writeHead(error.status||502);res.end(error.message);}}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const concurrency=24,timeoutMs=25000;
let next=0,done=Object.keys(results).length,saveQueue=Promise.resolve();
const report=()=>({startedAt,updatedAt:new Date().toISOString(),fingerprint,source,languages:Object.keys(languageSources),languageSources:[languageSources.eng,languageSources.ron],method:'2 seconds of H.264 video and available audio decoded through Hasimio proxy',timeoutMs,totalChannels:all.length,englishChannels:byLanguage('eng'),romanianChannels:byLanguage('ron'),selectedChannels:candidates.length,selectedStreams:tasks.length,results});
function save(){saveQueue=saveQueue.then(async()=>{await writeFile(new URL('report.json.tmp',directory),JSON.stringify(report(),null,2)+'\n');await rename(new URL('report.json.tmp',directory),new URL('report.json',directory));});return saveQueue;}
function check({channel,server}){
  return new Promise(resolve=>{
    const checkedAt=new Date().toISOString();let log='',progress='',timedOut=false;
    const child=spawn(ffmpeg,['-hide_banner','-nostdin','-loglevel','info','-threads','1','-rw_timeout','10000000','-protocol_whitelist','http,tcp,crypto','-allowed_extensions','ALL','-analyzeduration','3000000','-probesize','2000000','-i',origin+'/api/live-tv/'+channel.id+'/'+server.id+'/index.m3u8','-map','0:v:0','-map','0:a:0?','-t','2','-threads','1','-f','null','-','-progress','pipe:1','-nostats'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);
    child.stdout.on('data',data=>{progress=(progress+data).slice(-6000);});
    child.stderr.on('data',data=>{log=(log+data).slice(-10000);});
    child.once('error',error=>{clearTimeout(timer);resolve({ok:false,checkedAt,reason:error.message});});
    child.once('close',code=>{
      clearTimeout(timer);
      const frames=Math.max(0,...[...progress.matchAll(/^frame=(\d+)/gm)].map(match=>Number(match[1])));
      const h264=/Video: h264\b/.test(log),ok=code===0&&frames>0&&h264;
      resolve({ok,checkedAt,frames,codec:h264?'h264':(/Video: ([^,\s]+)/.exec(log)?.[1]||null),reason:ok?null:timedOut?'Timed out':!h264&&frames?'Unsupported browser video codec':log.trim().split('\n').slice(-6).join('\n')||'No decoded video',...(ok?{}:{log})});
    });
  });
}
try{
  await Promise.all(Array.from({length:concurrency},async()=>{
    while(next<tasks.length){
      const task=tasks[next++],key=task.server.url;
      if(results[key])continue;
      results[key]=task.server.supported===false?{ok:false,checkedAt:new Date().toISOString(),reason:'Unsupported stream format'}:await check(task);
      done++;
      if(done%20===0){const working=Object.values(results).filter(result=>result.ok).length;console.log(`${done}/${tasks.length} streams checked; ${working} working`);await save();}
    }
  }));
  await save();
  const channels=candidates.map(channel=>({...channel,servers:channel.servers.filter(server=>results[server.url]?.ok)})).filter(channel=>channel.servers.length).sort((a,b)=>a.name.localeCompare(b.name));
  const snapshot={checkedAt:new Date().toISOString(),languages:Object.keys(languageSources),source,languageSources:[languageSources.eng,languageSources.ron],channels};
  await writeFile(new URL('verified.json',directory),JSON.stringify(snapshot,null,2)+'\n');
  if(args.has('--apply')){
    if(!channels.length)throw Error('No streams passed; refusing to replace the channel catalog.');
    for(const language of Object.keys(languageSources))if(!channels.some(channel=>channel.language.split('+').includes(language)))throw Error('No verified channels for language: '+language+'; refusing to replace the catalog.');
    await writeFile(new URL('../server/iptv-org-verified.mjs',import.meta.url),'// Generated by scripts/audit-iptv-org.mjs --apply. Recheck to refresh.\nexport default '+JSON.stringify(snapshot,null,2)+';\n');
  }
  console.log(JSON.stringify({complete:true,workingChannels:channels.length,workingStreams:channels.reduce((sum,channel)=>sum+channel.servers.length,0),report:new URL('report.json',directory).pathname}));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
