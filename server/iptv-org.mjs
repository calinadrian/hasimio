import {createHash} from 'node:crypto';
import {lookup} from 'node:dns';
import {isIP} from 'node:net';

const playlistUrl='https://iptv-org.github.io/iptv/index.m3u';
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,32);
function publicAddress(address,family){
  if(family===6)return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:(?:0*:|db8:)/i.test(address)&&!/^2002:/i.test(address);
  const [a,b]=address.split('.').map(Number);
  return a>0&&a<224&&a!==10&&a!==127&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===198&&(b===18||b===19));
}
function publicUrl(value){
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href.length>8192)throw Error('Unsupported IPTV stream URL.');
  return url;
}
async function publicHost(url){
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await new Promise((resolve,reject)=>lookup(hostname,{all:true},(error,rows)=>error?reject(error):resolve(rows)));
  if(!addresses.length||addresses.some(({address,family})=>!publicAddress(address,family)))throw Error('IPTV streams must use public servers.');
}
async function read(response,limit){
  const reader=response.body?.getReader();if(!reader)throw Error('The IPTV server returned no data.');
  const chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('The IPTV response is too large.');chunks.push(Buffer.from(value));}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  return Buffer.concat(chunks);
}
async function discard(response){
  if(response.body?.cancel)await response.body.cancel();
  else response.body?.destroy?.();
}
export function parseIptvPlaylist(text){
  if(!text.trimStart().startsWith('#EXTM3U'))throw Error('IPTV-org returned an invalid playlist.');
  const entries=new Map();let info;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(line.startsWith('#EXTINF:')){info=line;continue;}
    if(!line||line.startsWith('#')||!info)continue;
    const attributes=Object.fromEntries([...info.matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
    const name=info.replace(/^#EXTINF:(?:[^",]|"[^"]*")*,/,'').trim();info=undefined;
    let url;try{url=publicUrl(line);}catch{continue;}
    const supported=!/\.(?:mpd|ts|mp4|mkv)$/i.test(url.pathname);
    const label=(name||attributes['tvg-id']||url.hostname).slice(0,300);
    const id='iptv-org-'+hash(attributes['tvg-id']||label);
    let channel=entries.get(id);
    if(!channel){channel={id,name:label,provider:'IPTV-org',group:attributes['group-title']||'Other',servers:[]};entries.set(id,channel);}
    if(!channel.servers.some(server=>server.url===url.href))channel.servers.push({id:'s'+(channel.servers.length+1),name:'Stream '+(channel.servers.length+1),url:url.href,supported});
  }
  return [...entries.values()];
}
export function createIptvOrg({fetchImpl=fetch,now=Date.now,catalogChannels}={}){
  let catalog,expires=0,pending;
  const fixedCatalog=catalogChannels?new Map(catalogChannels.map(channel=>[channel.id,channel])):undefined;
  const assets=new Map();
  async function request(value,signal){
    let url=publicUrl(value);
    for(let redirects=0;redirects<6;redirects++){
      await publicHost(url);
      const response=await fetchImpl(url.href,{redirect:'manual',signal});
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('location');await discard(response);
        if(!location)throw Error('The IPTV server returned an invalid redirect.');
        url=publicUrl(new URL(location,url).href);continue;
      }
      if(!response.ok){await discard(response);throw Error('The IPTV server is unavailable. Try another stream.');}
      return {response,url:url.href};
    }
    throw Error('Too many IPTV redirects.');
  }
  async function load(){
    if(fixedCatalog)return fixedCatalog;
    if(catalog&&expires>now())return catalog;
    if(!pending)pending=(async()=>{
      const {response}=await request(playlistUrl,AbortSignal.timeout(30000));
      const text=(await read(response,16*1024*1024)).toString('utf8');
      const entries=new Map(parseIptvPlaylist(text).map(channel=>[channel.id,channel]));
      if(!entries.size)throw Error('No supported IPTV channels were found.');
      catalog=entries;expires=now()+60*60*1000;return catalog;
    })().finally(()=>{pending=undefined;});
    return pending;
  }
  async function channels(){return [...(await load()).values()].map(channel=>({...channel,servers:channel.servers.map(({id,name,supported})=>({id,name,supported}))}));}
  function asset(channel,id,value){
    const url=publicUrl(value).href,key=hash(channel+':'+id+':'+url);
    assets.delete(key);assets.set(key,{channel,id,url,expires:now()+10*60000});
    if(assets.size>4096)assets.delete(assets.keys().next().value);
    return '/api/live-tv/'+channel+'/'+id+'/asset/'+key;
  }
  async function resource(channel,id,name,signal){
    let target;
    if(name==='index.m3u8')target=(await load()).get(channel)?.servers.find(server=>server.id===id);
    else{const item=assets.get(name);if(item?.channel===channel&&item.id===id&&item.expires>now())target=item;}
    if(!target)throw Object.assign(Error('This IPTV stream expired or is unavailable. Reload the channel.'),{status:404});
    const timeout=AbortSignal.timeout(20000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
    const {response,url}=await request(target.url,combined),data=await read(response,16*1024*1024);
    if(data.toString('utf8',0,16).trimStart().startsWith('#EXTM3U')){
      const body=data.toString('utf8').replace(/^\uFEFF/,'').split(/\r?\n/).map(line=>{
        if(!line.trim())return line;
        if(!line.startsWith('#'))return asset(channel,id,new URL(line.trim(),url).href);
        return line.replace(/\bURI="([^"]+)"/g,(_,value)=>'URI="'+asset(channel,id,new URL(value,url).href)+'"');
      }).join('\n');
      return {body,type:'application/vnd.apple.mpegurl'};
    }
    if(name==='index.m3u8'||/^\s*<(?:!doctype|html|script)/i.test(data.toString('utf8',0,100)))throw Error('This IPTV stream is not a supported HLS video stream.');
    return {body:data,type:data[0]===0x47?'video/mp2t':'application/octet-stream'};
  }
  return {channels,resource};
}
