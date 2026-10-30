import {createHash} from 'node:crypto';

const channels={
  'cartoon-network':{pages:{main:'https://www.cool-etv.net/ch/cartoon.htm',alternative:'https://www.cool-etv.net/ch/cartoon-s2.htm'},players:['https://saruman1.tharen001.cfd/000/cartun.html'],origin:'https://saruman1.tharen001.cfd',path:'/cartun/',encoding:'cartoon'},
  a1:{pages:{main:'https://www.cool-etv.net/ch/an1.htm',alternative:'https://www.cool-etv.net/ch/an1-s2.htm'},players:['https://canale-tv.net/channel-v2/a1.html','https://canale-tv.net/channel/a1.html','https://alpha1.yozefina.cfd/000/anyone.html'],origin:'https://alpha1.yozefina.cfd',path:'/ah1/',encoding:'a1'},
  tlc:{pages:{main:'https://www.cool-etv.net/ch/tlc-s1.htm'},players:['https://atlantida1.aquax001.shop/000/t1c.html'],origin:'https://atlantida1.aquax001.shop',path:'/telece/',encoding:'tlc'},
};
const encodings={
  cartoon:{outer:[818886,254,633,21878,43077,2549222],inner:[107,101,50102,38953,4477073],dictionary:[70,94,90,75,86,76,87,74,82,65,81,79,85,80,60,88,66,71,89,72],prefix:[10,32,39,96,42,92]},
  a1:{outer:[3293193,300,106,22960,36563,6421831],inner:[61,340,20120,40325,7001151],dictionary:[94,74,70,79,66,90,71,89,81,82,85,72,75,87,88,60,86,80,65,76],prefix:[96,92,32,10,42,39]},
  tlc:{outer:[2873238,489,391,41997,35660,3782086],inner:[489,391,41997,35660,3782086],dictionary:[74,60,88,85,66,76,70,94,82,86,71,72,87,81,65,79,89,75,80,90],prefix:[92,32,39,10,96,42]},
};
function channelConfig(channel){
  if(!Object.hasOwn(channels,channel))throw Object.assign(Error('Unknown Live TV channel.'),{status:404});
  return channels[channel];
}
function shuffle(text,seed,offsetA,offsetB,modA,modB,mod){
  const chars=[...text],length=chars.length;
  for(let i=0;i<length;i++){
    const a=seed*(i+offsetA)+(seed%modA),b=seed*(i+offsetB)+(seed%modB),x=a%length,y=b%length;
    [chars[x],chars[y]]=[chars[y],chars[x]];seed=(a+b)%mod;
  }
  return chars.join('');
}
function literal(text,start){
  const quote=text[start];let value='';
  for(let i=start+1;i<text.length;i++){
    const char=text[i];
    if(char===quote)return {value,end:i+1};
    if(char!=='\\'){value+=char;continue;}
    const next=text[++i];
    if(next==='x'||next==='u'){
      const length=next==='x'?2:4,hex=text.slice(i+1,i+1+length);
      if(!new RegExp('^[a-f\\d]{'+length+'}$','i').test(hex))throw Error('Unsupported player encoding.');
      value+=String.fromCharCode(parseInt(hex,16));i+=length;
    }else value+=({n:'\n',r:'\r',t:'\t'}[next]??next);
  }
  throw Error('Incomplete player data.');
}
// Decode data strings only. Provider JavaScript and advertising are never executed.
function unpack(text,{dictionary,prefix}){
  const indices=[];dictionary.forEach((value,index)=>indices[value]=index+1);
  const words=text.split(' ');let expanded=text.length;
  for(let b=words.length-1;b>=0;b--){
    const word=words[b];let parts,start=0;
    for(let i=0;i<word.length;i++){
      const code=word.charCodeAt(i),entry=indices[code];let index,at;
      if(entry){index=(entry-1)*93+word.charCodeAt(i+1)-33;at=i;i++;}
      else if(code===96){index=93*(dictionary.length-33+word.charCodeAt(i+1))+word.charCodeAt(i+2)-33;at=i;i+=2;}
      else continue;
      parts??=[];if(at>start)parts.push(word.slice(start,at));parts.push(words[index+1]??'');start=i+1;
    }
    if(parts){
      if(start<word.length)parts.push(word.slice(start));
      const length=parts.reduce((total,part)=>total+part.length,0);expanded+=length-word.length;
      if(expanded>1024*1024)throw Error('The channel player data is too large.');
      words[b]=parts.join('');
    }
  }
  let value=words[0];
  [...prefix,...dictionary].forEach((code,index)=>{value=value.split('.'+'abcdefghijklmnopqrstuvwxyz'[index]).join(String.fromCharCode(code));});
  return value.split('.!').join('.');
}
function streamUrl(value,channel){
  const config=channelConfig(channel);
  if(value.length>4096)throw Error('The channel video URL is too long.');
  const url=new URL(value);
  if(url.origin!==config.origin||!url.pathname.startsWith(config.path)||url.username||url.password||url.hash)throw Error('The channel returned an unsupported video host.');
  return url.href;
}
export function decodeCoolEtvStream(html,channel='cartoon-network'){
  const config=channelConfig(channel),encoding=encodings[config.encoding];
  const direct=[...html.matchAll(/https:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/g)].find(match=>match[0].startsWith(config.origin+config.path));
  if(direct)return streamUrl(direct[0],channel);
  const end=html.indexOf('var catsafi');
  const block=html.slice(html.indexOf('var cat1;'),end<0?html.length:end);
  const encoded=/var\s+\w+\s*=\s*\w+\(\s*\w+\(\s*(['"])/.exec(block);
  if(!encoded)throw Error('The provider changed its player. Try the other server.');
  const data=literal(block,encoded.index+encoded[0].length-1).value;
  if(data.length>16384)throw Error('Unsupported channel player data.');
  const decoded=unpack(shuffle(data,...encoding.outer),encoding);
  const payload=/\)\(\s*(['"])/.exec(decoded);
  if(!payload)throw Error('The provider did not supply a video source.');
  const value=literal(decoded,payload.index+payload[0].length-1);
  const seed=/^\s*,\s*(\d+)\s*\)/.exec(decoded.slice(value.end));
  if(!seed)throw Error('Unsupported channel source encoding.');
  return streamUrl(shuffle(value.value,Number(seed[1]),...encoding.inner).split('%')[0].replaceAll('#1','%').replaceAll('#0','#'),channel);
}
async function bytes(response,limit){
  const reader=response.body?.getReader();if(!reader)throw Error('The channel returned an empty response.');
  const chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('The channel response is too large.');chunks.push(Buffer.from(value));}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  return Buffer.concat(chunks);
}
export function createLiveTv({fetchImpl=fetch,now=Date.now}={}){
  const sources=new Map(),assets=new Map();
  async function request(url,referer,signal){
    const response=await fetchImpl(url,{headers:{Referer:referer},redirect:'manual',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(12000)});
    if(response.status!==200)throw Error('The channel server is unavailable. Try the other server.');
    return response;
  }
  async function resolve(channel,id){
    const {pages,players}=channelConfig(channel),sourceKey=channel+':'+id;
    if(!Object.hasOwn(pages,id))throw Object.assign(Error('Unknown Live TV server.'),{status:404});
    let item=sources.get(sourceKey);
    if(!item||item.expires<=now()){
      const promise=(async()=>{
        const page=(await bytes(await request(pages[id],pages[id]),512*1024)).toString('utf8');
        const frame=/<iframe\b[^>]*\b(?:data-src|src)\s*=\s*(['"])(.*?)\1/i.exec(page)?.[2];
        const decoded=frame?.replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>String.fromCharCode(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replaceAll('&amp;','&');
        const player=new URL(decoded??'');
        if(!players.includes(player.href))throw Error('The provider changed its channel player.');
        const html=(await bytes(await request(player.href,pages[id]),512*1024)).toString('utf8');
        return {url:decodeCoolEtvStream(html,channel),referer:player.href};
      })();
      item={promise,expires:now()+120000};sources.set(sourceKey,item);promise.catch(()=>{if(sources.get(sourceKey)===item)sources.delete(sourceKey);});
    }
    return item.promise;
  }
  function asset(channel,id,url,referer){
    const target=streamUrl(url,channel),key=createHash('sha256').update(channel+':'+id+':'+target).digest('hex').slice(0,32);
    assets.delete(key);assets.set(key,{channel,id,url:target,referer,expires:now()+10*60000});
    if(assets.size>2048)assets.delete(assets.keys().next().value);
    return `/api/live-tv/${channel}/${id}/asset/${key}`;
  }
  async function resource(channel,id,name,signal){
    const {pages}=channelConfig(channel),sourceKey=channel+':'+id;
    if(!Object.hasOwn(pages,id))throw Object.assign(Error('Unknown Live TV server.'),{status:404});
    let target;
    if(name==='index.m3u8')target=await resolve(channel,id);
    else{const item=assets.get(name);if(!item||item.channel!==channel||item.id!==id||item.expires<=now())throw Object.assign(Error('This live segment expired. Reload the channel.'),{status:404});target=item;}
    try{
      const response=await request(target.url,target.referer,signal),data=await bytes(response,16*1024*1024);
      if(data.subarray(0,7).toString()==='#EXTM3U'){
        const playlist=data.toString('utf8').split(/\r?\n/).map(line=>{
          if(!line.trim())return line;
          if(!line.startsWith('#'))return asset(channel,id,new URL(line.trim(),target.url).href,target.referer);
          return line.replace(/\bURI="([^"]+)"/g,(_,value)=>'URI="'+asset(channel,id,new URL(value,target.url).href,target.referer)+'"');
        }).join('\n');
        return {body:playlist,type:'application/vnd.apple.mpegurl'};
      }
      if(/^\s*<(?:!doctype|html|script)/i.test(data.subarray(0,80).toString()))throw Error('The channel returned a webpage instead of video. Try the other server.');
      return {body:data,type:data[0]===0x47?'video/mp2t':'application/octet-stream'};
    }catch(error){sources.delete(sourceKey);throw error;}
  }
  return {resolve,resource};
}
