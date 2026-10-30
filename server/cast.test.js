import {describe,it,expect} from 'vitest';
import {decodeCastMessage,encodeCastMessage,parseSsdpResponse,castDeviceInfo,preferredOrigin,castContentType,castMediaUrlFor} from './cast.mjs';
import {createMediaService} from './service.mjs';

const reply=async(service,{method='GET',url,headers={},body}={})=>{
  let status,payload;const res={setHeader(){},writeHead(code){status=code;},end(text){payload=text?JSON.parse(text):undefined;}};
  await service.handle({method,url,headers:{host:'127.0.0.1:11475',...headers},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){if(body)yield Buffer.from(JSON.stringify(body));}},res);
  return {status,body:payload};
};

describe('native Chromecast protocol',()=>{
  it('round-trips the protobuf envelope around JSON payloads',()=>{
    const payload=JSON.stringify({type:'LAUNCH',appId:'CC1AD845',requestId:3});
    const message=decodeCastMessage(encodeCastMessage({sourceId:'sender-0',destinationId:'receiver-0',namespace:'urn:x-cast:com.google.cast.receiver',payload}));
    expect(message).toMatchObject({protocolVersion:0,payloadType:0,sourceId:'sender-0',destinationId:'receiver-0',namespace:'urn:x-cast:com.google.cast.receiver',payload});
  });
  it('reads case-insensitive SSDP headers',()=>{
    const info=parseSsdpResponse('HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.20:8008/ssdp/device-desc.xml\r\nServer: Linux UPnP/1.0\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n\r\n');
    expect(info.location).toBe('http://192.168.1.20:8008/ssdp/device-desc.xml');
    expect(info.server).toBe('Linux UPnP/1.0');
  });
  it('uses the DIAL friendly name and falls back to the address',()=>{
    expect(castDeviceInfo('<root><friendlyName>Living Room TV</friendlyName><modelName>Chromecast</modelName></root>','http://192.168.1.20:8008/ssdp/device-desc.xml')).toEqual({id:'192.168.1.20',name:'Living Room TV',host:'192.168.1.20',model:'Chromecast'});
    expect(castDeviceInfo('<root/>','http://192.168.1.21:8008/')).toMatchObject({id:'192.168.1.21',name:'Chromecast 192.168.1.21'});
  });
  it('prefers a local origin on the TV network and otherwise keeps the first',()=>{
    expect(preferredOrigin(['http://172.30.208.1:6000','http://192.168.1.5:6000'],'192.168.1.20')).toBe('http://192.168.1.5:6000');
    expect(preferredOrigin(['http://10.0.0.2:6000'],'192.168.1.20')).toBe('http://10.0.0.2:6000');
  });
  it('moves loopback media onto the LAN relay while leaving public URLs alone',()=>{
    expect(castMediaUrlFor('http://127.0.0.1:11475/api/torrents/abc/files/0',['http://192.168.1.5:6000'],'192.168.1.20'))
      .toBe('http://192.168.1.5:6000/api/torrents/abc/files/0');
    expect(castMediaUrlFor('https://cdn.example.com/movie.mp4',['http://192.168.1.5:6000'],'192.168.1.20'))
      .toBe('https://cdn.example.com/movie.mp4');
    expect(()=>castMediaUrlFor('http://127.0.0.1:11475/file.mp4',[],'192.168.1.20')).toThrow(/LAN address/);
  });
  it('guesses a Cast media type from the path',()=>{
    expect(castContentType('http://192.168.1.5:6000/api/torrents/abc/files/0')).toBe('video/mp4');
    expect(castContentType('http://192.168.1.5:6000/movie.mkv')).toBe('video/x-matroska');
  });
});

describe('native casting endpoints',()=>{
  it('reports casting unavailable unless the engine supplies LAN media origins',async()=>{
    const service=createMediaService({allowedOrigins:new Set()});
    expect((await reply(service,{url:'/api/cast'})).body).toEqual({available:false});
    expect((await reply(service,{url:'/api/cast/status'})).body).toMatchObject({available:false,active:false});
    expect((await reply(service,{url:'/api/cast/devices'})).status).toBe(503);
    await service.close();
  });
  it('exposes native casting status when the engine can reach the LAN',async()=>{
    const service=createMediaService({allowedOrigins:new Set(),castMediaOrigins:async()=>['http://192.168.1.5:6000']});
    expect((await reply(service,{url:'/api/cast'})).body).toEqual({available:true});
    expect((await reply(service,{url:'/api/cast/status'})).body).toMatchObject({available:true,active:false});
    await service.close();
  });
});
