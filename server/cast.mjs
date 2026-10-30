// Chromecast control for the local engine. The Google Cast sender SDK only exists in a
// Chromium page with the Cast media router, so the desktop app cannot use it. This module
// discovers Cast devices on the LAN and speaks the CASTV2 protocol directly instead.
import dgram from 'node:dgram';
import tls from 'node:tls';
import {networkInterfaces} from 'node:os';
import {privateIPv4} from './torrent-utils.mjs';

const DEFAULT_RECEIVER='CC1AD845';
const CAST_PORT=8009;
const DISCOVER_MS=2500;
const LOOPBACK_HOSTS=new Set(['localhost','127.0.0.1','0.0.0.0','::1','[::1]']);
const NAMESPACES={
  connection:'urn:x-cast:com.google.cast.tp.connection',
  heartbeat:'urn:x-cast:com.google.cast.tp.heartbeat',
  receiver:'urn:x-cast:com.google.cast.receiver',
  media:'urn:x-cast:com.google.cast.media',
};
const MEDIA_TYPES=[
  [/\.m3u8$/i,'application/x-mpegURL'],
  [/\.mpd$/i,'application/dash+xml'],
  [/\.mp4$/i,'video/mp4'],
  [/\.m4v$/i,'video/mp4'],
  [/\.webm$/i,'video/webm'],
  [/\.mov$/i,'video/quicktime'],
  [/\.mkv$/i,'video/x-matroska'],
  [/\.avi$/i,'video/x-msvideo'],
];
const M_SEARCH=['M-SEARCH * HTTP/1.1','HOST: 239.255.255.250:1900','MAN: "ssdp:discover"','MX: 2','ST: urn:dial-multiscreen-org:service:dial:1','',''].join('\r\n');

function varint(value){
  const bytes=[];
  while(value>127){bytes.push((value&0x7f)|0x80);value=Math.floor(value/128);}
  bytes.push(value);
  return Buffer.from(bytes);
}
function textField(tag,value){const data=Buffer.from(value,'utf8');return Buffer.concat([varint(tag<<3|2),varint(data.length),data]);}
function numberField(tag,value){return Buffer.concat([varint(tag<<3|0),varint(value)]);}
// CastMessage envelope. The payload itself is JSON, so only this small protobuf wrapper is needed.
export function encodeCastMessage({sourceId,destinationId,namespace,payload}){
  return Buffer.concat([numberField(1,0),textField(2,sourceId),textField(3,destinationId),textField(4,namespace),numberField(5,0),textField(6,payload)]);
}
function readVarint(buffer,offset){
  let value=0,shift=0,byte;
  do {
    if(offset>=buffer.length)throw new Error('Truncated Cast message.');
    byte=buffer[offset++];value+=(byte&0x7f)*2**shift;shift+=7;
  } while(byte&0x80);
  return [value,offset];
}
export function decodeCastMessage(buffer){
  const message={};let offset=0;
  while(offset<buffer.length){
    const [key,next]=readVarint(buffer,offset);offset=next;
    const field=key>>3,wire=key&7;
    if(wire===0){const [value,pos]=readVarint(buffer,offset);offset=pos;if(field===1)message.protocolVersion=value;else if(field===5)message.payloadType=value;}
    else if(wire===2){
      const [length,pos]=readVarint(buffer,offset);offset=pos;
      const data=buffer.subarray(offset,offset+length);offset+=length;
      if(field===2)message.sourceId=data.toString('utf8');
      else if(field===3)message.destinationId=data.toString('utf8');
      else if(field===4)message.namespace=data.toString('utf8');
      else if(field===6)message.payload=data.toString('utf8');
    }
    else if(wire===5)offset+=4;
    else if(wire===1)offset+=8;
    else break;
  }
  return message;
}

export function parseSsdpResponse(text){
  const headers={};
  for(const line of String(text).split(/\r?\n/).slice(1)){
    const colon=line.indexOf(':');
    if(colon>0)headers[line.slice(0,colon).trim().toLowerCase()]=line.slice(colon+1).trim();
  }
  return {location:headers.location,server:headers.server,usn:headers.usn,st:headers.st};
}
export function castDeviceInfo(xml,location){
  const name=/<friendlyName>([^<]+)<\/friendlyName>/i.exec(String(xml))?.[1]?.trim();
  const model=/<modelName>([^<]+)<\/modelName>/i.exec(String(xml))?.[1]?.trim();
  const url=new URL(location);
  const host=url.hostname;
  return {id:host,name:name||`Chromecast ${host}`,host,...(model?{model}:{})};
}
const octets=value=>String(value).replace(/^::ffff:/,'').split('.').map(Number);
// Prefer the local address on the TV's own /24; adapters such as WSL or VPNs are often listed first.
export function preferredOrigin(origins,deviceHost){
  const target=octets(deviceHost);
  if(target.length===4&&target.every(Number.isInteger)){
    const same=origins.find(origin=>{try{const local=octets(new URL(origin).hostname);return local.length===4&&local[0]===target[0]&&local[1]===target[1]&&local[2]===target[2];}catch{return false;}});
    if(same)return same;
  }
  return origins[0];
}
export function castContentType(url){
  let pathname=String(url);
  try {pathname=new URL(url).pathname;} catch {/* Keep the raw value. */}
  return MEDIA_TYPES.find(([pattern])=>pattern.test(pathname))?.[1]??'video/mp4';
}
// The TV cannot reach a loopback URL, so local engine media moves onto the LAN relay.
export function castMediaUrlFor(url,origins,deviceHost){
  const parsed=new URL(url);
  if(!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()))return parsed.href;
  const origin=preferredOrigin(origins,deviceHost);
  if(!origin)throw new Error('Casting local video needs a LAN address for this PC. Check the network connection and try again.');
  return new URL(parsed.pathname+parsed.search+parsed.hash,origin).href;
}
function privateAddresses(){
  return [...new Set(Object.values(networkInterfaces()).flat().filter(item=>item?.family==='IPv4'&&!item.internal&&privateIPv4(item.address)).map(item=>item.address))];
}

class CastConnection {
  constructor(device,{onClose}={}){
    this.device=device;this.onClose=onClose;this.sourceId='sender-0';this.waiters=new Set();this.requestId=0;this.closed=false;this.app=undefined;this.media=undefined;this.buffer=Buffer.alloc(0);
  }
  connect(){
    return new Promise((resolve,reject)=>{
      this.socket=tls.connect({host:this.device.host,port:CAST_PORT,rejectUnauthorized:false});
      this.socket.setNoDelay(true);
      const fail=error=>{clearTimeout(timer);this.socket.destroy();reject(error);};
      const timer=setTimeout(()=>fail(new Error('The TV did not accept the connection. Make sure it is on and on the same Wi-Fi network.')),10000);
      this.socket.once('error',fail);
      this.socket.once('secureConnect',()=>{
        clearTimeout(timer);this.socket.removeListener('error',fail);
        this.socket.on('error',error=>this._close(error));
        this.socket.on('close',()=>this._close(new Error('The TV closed the connection.')));
        this.socket.on('data',chunk=>this._data(chunk));
        this.send(NAMESPACES.connection,{type:'CONNECT'});
        this.heartbeat=setInterval(()=>{try {this.send(NAMESPACES.heartbeat,{type:'PING'});}catch{/* Closing. */}},5000);
        this.heartbeat.unref?.();
        resolve();
      });
    });
  }
  send(namespace,payload,destinationId='receiver-0'){
    if(this.closed)throw new Error('The TV is no longer connected.');
    const text=typeof payload==='string'?payload:JSON.stringify(payload);
    const body=encodeCastMessage({sourceId:this.sourceId,destinationId,namespace,payload:text});
    const header=Buffer.alloc(4);header.writeUInt32BE(body.length,0);
    this.socket.write(Buffer.concat([header,body]));
  }
  _data(chunk){
    this.buffer=Buffer.concat([this.buffer,chunk]);
    while(this.buffer.length>=4){
      const length=this.buffer.readUInt32BE(0);
      if(this.buffer.length<4+length)return;
      const body=this.buffer.subarray(4,4+length);this.buffer=this.buffer.subarray(4+length);
      let message,json;
      try {message=decodeCastMessage(body);json=JSON.parse(message.payload);} catch {continue;}
      this._message(message,json);
    }
  }
  _message(message,json){
    if(message.namespace===NAMESPACES.receiver&&json.type==='RECEIVER_STATUS')this.status=json.status;
    if(message.namespace===NAMESPACES.media)this.media=json.status?.[0]??this.media;
    for(const waiter of [...this.waiters]){
      if(waiter.test(json,message)){clearTimeout(waiter.timer);this.waiters.delete(waiter);waiter.resolve(json);}
    }
  }
  _wait(test,timeout,description){
    return new Promise((resolve,reject)=>{
      const waiter={test,resolve};
      waiter.timer=setTimeout(()=>{this.waiters.delete(waiter);reject(new Error(description));},timeout);
      waiter.timer.unref?.();
      this.waiters.add(waiter);
    });
  }
  async _request(payload,test,timeout,description){
    const request=++this.requestId;
    const waiting=this._wait((json)=>json.requestId===request?test(json):json.requestId==null&&test(json),timeout,description);
    try {this.send(NAMESPACES.receiver,{...payload,requestId:request});}
    catch(error){waiting.catch(()=>{});throw error;}
    return waiting;
  }
  async receiverStatus(){
    const status=await this._request({type:'GET_STATUS'},json=>json.type==='RECEIVER_STATUS',8000,'The TV did not report its status.');
    this.status=status.status;
    return status.status;
  }
  async launch(){
    let status=await this.receiverStatus();
    let app=status?.applications?.find(item=>item.appId===DEFAULT_RECEIVER);
    if(!app){
      const launched=await this._request({type:'LAUNCH',appId:DEFAULT_RECEIVER},json=>json.type==='RECEIVER_STATUS'||json.type==='LAUNCH_ERROR',12000,'The TV could not open the media receiver.');
      if(launched.type==='LAUNCH_ERROR')throw new Error(launched.reason==='NOT_FOUND'?'The TV does not support this Cast receiver.':'The TV could not open the media receiver.');
      this.status=launched.status;status=launched.status;
      app=status?.applications?.find(item=>item.appId===DEFAULT_RECEIVER);
    }
    if(!app?.transportId)throw new Error('The TV did not provide a media session.');
    this.app=app;
    this.send(NAMESPACES.connection,{type:'CONNECT'},app.transportId);
    return app;
  }
  async load({url,contentType,title,subtitle,position=0}){
    if(!this.app)throw new Error('The TV media receiver is not ready.');
    const request=++this.requestId;
    const waiting=this._wait(json=>json.type==='MEDIA_STATUS'?json.requestId===request:json.requestId==null||json.requestId===request&&['LOAD_FAILED','INVALID_REQUEST','INVALID_PLAYER_STATE'].includes(json.type),12000,'The TV did not start the video. Check the network and try again.');
    const media={contentId:url,streamType:'BUFFERED',contentType,autoplay:true,currentTime:Math.max(0,position)};
    if(title||subtitle)media.metadata={type:0,...(title?{title}:{}),...(subtitle?{subtitle}:{})};
    try {
      this.send(NAMESPACES.media,{type:'LOAD',requestId:request,media,autoplay:true,currentTime:Math.max(0,position)},this.app.transportId);
    } catch(error){waiting.catch(()=>{});throw error;}
    const result=await waiting;
    if(result.type==='LOAD_FAILED'||result.type==='INVALID_REQUEST'||result.type==='INVALID_PLAYER_STATE')throw new Error(result.reason==='LOAD_CANCELLED'?'The TV cancelled this video. Try another source.':'The TV could not play this source. Try a different quality or source.');
    this.media=result.status?.[0]??this.media;
    return this.media;
  }
  status(){
    return {playerState:this.media?.playerState,currentTime:this.media?.currentTime,duration:this.media?.media?.duration,mediaSessionId:this.media?.mediaSessionId};
  }
  async stopSession(){
    if(this.closed)return;
    try {this.send(NAMESPACES.media,{type:'STOP',requestId:++this.requestId},this.app?.transportId||'receiver-0');} catch {/**/}
    try {if(this.app?.sessionId)this.send(NAMESPACES.receiver,{type:'STOP',sessionId:this.app.sessionId});} catch {/**/}
    await new Promise(resolve=>setTimeout(resolve,120));
    this.close();
  }
  close(){
    this._close();
  }
  _close(error){
    if(this.closed)return;
    this.closed=true;clearInterval(this.heartbeat);
    const socket=this.socket;this.socket=undefined;
    if(socket&&!socket.destroyed)socket.destroy();
    for(const waiter of this.waiters){clearTimeout(waiter.timer);waiter.reject(error??new Error('The TV disconnected.'));}
    this.waiters.clear();
    this.onClose?.();
  }
}

export function createCastController({fetchImpl=fetch,mediaOrigins,discoverMs=DISCOVER_MS}={}){
  let cached;let connection;let device;
  async function listDevices({refresh=false}={}){
    const now=Date.now();
    if(!refresh&&cached&&now-cached.at<(cached.devices.length?60000:10000))return cached.devices;
    const devices=await discoverDevices({fetchImpl,timeout:discoverMs});
    cached={at:now,devices};
    return devices;
  }
  async function start({deviceId,url,title,subtitle,contentType,position=0}={}){
    if(!url)throw new Error('This source cannot be cast.');
    if(!mediaOrigins)throw new Error('Casting from the engine is not available.');
    const devices=await listDevices();
    const target=devices.find(item=>item.id===deviceId);
    if(!target)throw new Error('That TV is no longer available. Scan again.');
    const origins=await mediaOrigins(target.host);
    const mediaUrl=castMediaUrlFor(url,origins,target.host);
    await stop();
    const client=new CastConnection(target,{onClose:()=>{if(connection===client){connection=undefined;device=undefined;}}});
    connection=client;device=target;
    try {
      await client.connect();
      await client.launch();
      await client.load({url:mediaUrl,contentType:contentType||castContentType(mediaUrl),title,subtitle,position});
    } catch(error){
      if(connection===client){connection=undefined;device=undefined;}
      client.close();
      throw error;
    }
    return {device:target};
  }
  async function stop(){
    const client=connection;connection=undefined;device=undefined;
    if(client)await client.stopSession();
  }
  function status(){
    return {active:Boolean(connection),device,cast:connection?.status()};
  }
  async function close(){await stop();}
  return {listDevices,start,stop,status,close};
}

async function discoverDevices({fetchImpl=fetch,timeout=DISCOVER_MS}={}){
  const locations=new Map();
  const socket=dgram.createSocket('udp4');
  const addresses=privateAddresses();
  try {
    await new Promise((resolve,reject)=>{
      const fail=error=>{try{socket.close();}catch{/**/}reject(error);};
      socket.once('error',fail);
      socket.bind(0,()=>{socket.removeListener('error',fail);socket.on('error',()=>{/* Discovery is best effort. */});resolve();});
    });
    socket.on('message',message=>{
      try {
        const info=parseSsdpResponse(message.toString('utf8'));
        if(!info.location)return;
        const url=new URL(info.location);
        // Chromecast DIAL descriptions are served on 8008; other DIAL devices cannot run a Cast receiver.
        if(url.port!=='8008')return;
        locations.set(url.hostname,info.location);
      } catch {/**/}
    });
    for(const address of addresses.length?addresses:[undefined]){
      try {if(address)socket.setMulticastInterface(address);} catch {/**/}
      await new Promise(resolve=>socket.send(M_SEARCH,1900,'239.255.255.250',()=>resolve()));
    }
    await new Promise(resolve=>setTimeout(resolve,Math.max(500,timeout)));
  } finally {
    try {socket.close();} catch {/**/}
  }
  const found=await Promise.all([...locations.values()].map(async location=>{
    try {
      const response=await fetchImpl(location,{signal:AbortSignal.timeout(2500)});
      if(!response.ok)throw new Error('No description.');
      return castDeviceInfo(await response.text(),location);
    } catch {
      const host=new URL(location).hostname;
      return {id:host,name:`Chromecast ${host}`,host};
    }
  }));
  return found.sort((a,b)=>a.name.localeCompare(b.name));
}
