import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createSyncRelay} from '../server/sync-relay.mjs';
import {DeviceSync} from './device-sync';
import {saveProgress,resumePosition} from './playback-progress';

let relay:ReturnType<typeof createSyncRelay>,directory:string,storage:Map<string,string>,offline=false,requests:string[]=[],responses:string[]=[];
const server='http://127.0.0.1:8787';
beforeEach(async()=>{
  await mkdir('.cache',{recursive:true});directory=await mkdtemp(path.resolve('.cache/sync-client-'));relay=createSyncRelay({dataDir:directory,publicUrl:server});offline=false;storage=new Map();requests=[];responses=[];
  vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
  vi.stubGlobal('window',new EventTarget());
  vi.stubGlobal('fetch',async(url:string,options:RequestInit={})=>{
    if(offline)throw Error('Offline');const parsed=new URL(url),req=Readable.from(options.body?[String(options.body)]:[]);
    requests.push(parsed.pathname+parsed.search);Object.assign(req,{url:parsed.pathname+parsed.search,method:options.method??'GET',headers:Object.fromEntries(new Headers(options.headers).entries()),socket:{remoteAddress:'127.0.0.1'}});
    let status=200,text='';const headers:Record<string,string>={};
    const res={setHeader:(key:string,value:string)=>headers[key]=value,writeHead:(code:number,extra:Record<string,string>={})=>{status=code;Object.assign(headers,extra);},end:(body='')=>text=body};
    await relay.handle(req as never,res as never);responses.push(text);return new Response(text,{status,headers});
  });
});
afterEach(async()=>{await relay.close();await rm(directory,{recursive:true,force:true});vi.unstubAllGlobals();});
describe('complete device sync',()=>{
  it('does not upload identical data repeatedly when devices store records in different orders',async()=>{
    const desktop=new DeviceSync(),desktopStorage=storage;
    storage.set('hasimio:library',JSON.stringify([{id:'tt1',type:'movie',name:'Film'}]));await desktop.create(server,'Desktop');const invite=await desktop.invitation();
    storage=new Map();storage.set('hasimio:settings',JSON.stringify({volume:0.6}));const phoneStorage=storage,phone=new DeviceSync();await phone.join(invite.url,'Phone');
    storage=desktopStorage;await desktop.sync();const filename=path.join(directory,desktop.status.identity!.spaceId+'.json'),before=JSON.parse(await readFile(filename,'utf8')).revision;
    storage=phoneStorage;await phone.sync();storage=desktopStorage;await desktop.sync();expect(JSON.parse(await readFile(filename,'utf8')).revision).toBe(before);
  });
  it('polls without downloading the snapshot while idle and still uploads local changes',async()=>{
    const desktop=new DeviceSync(),desktopStorage=storage;await desktop.create(server,'Desktop');const invite=await desktop.invitation();
    storage=new Map();const phoneStorage=storage,phone=new DeviceSync();await phone.join(invite.url,'Phone');
    storage=desktopStorage;await desktop.sync();const states:string[]=[];desktop.subscribe(()=>states.push(desktop.status.state));
    requests=[];responses=[];await desktop.sync();
    expect(requests).toEqual(['/api/sync/spaces/'+desktop.status.identity!.spaceId+'?since='+JSON.parse(responses[0]).revision]);expect(JSON.parse(responses[0])).toMatchObject({unchanged:true});expect(responses[0]).not.toContain('"data"');
    expect(states).toEqual(['ready']);
    storage.set('hasimio:settings',JSON.stringify({volume:0.3}));await desktop.sync();expect(desktop.status.state).toBe('ready');
    storage=phoneStorage;await phone.sync();expect(JSON.parse(storage.get('hasimio:settings')!).volume).toBe(0.3);
  });
  it('pairs independent devices, syncs progress/settings, merges offline removals, and survives restart',async()=>{
    const desktop=new DeviceSync(),desktopStorage=storage;
    storage.set('hasimio:library',JSON.stringify([{id:'tt1',type:'movie',name:'Private film'}]));storage.set('hasimio:settings',JSON.stringify({volume:0.6}));saveProgress('movie:tt1',500,1000);
    const recovery=await desktop.create(server,'Desktop'),invite=await desktop.invitation();
    const identity=desktop.status.identity!;const disk=await readFile(path.join(directory,identity.spaceId+'.json'),'utf8');expect(disk).not.toContain('Private film');expect(disk).not.toContain(identity.key);
    storage=new Map();const phoneStorage=storage,phone=new DeviceSync();await phone.join(invite.url,'Phone');
    expect(resumePosition('movie:tt1')).toBe(500);expect(JSON.parse(storage.get('hasimio:settings')!).volume).toBe(0.6);expect(JSON.parse(storage.get('hasimio:library')!)[0].name).toBe('Private film');
    saveProgress('movie:tt1',120,1000);await phone.sync();
    storage=desktopStorage;await desktop.sync();expect(resumePosition('movie:tt1')).toBe(120);
    offline=true;storage.set('hasimio:library','[]');await desktop.sync();expect(desktop.status.state).toBe('offline');offline=false;
    storage=phoneStorage;storage.set('hasimio:settings',JSON.stringify({volume:0.4}));await phone.sync();
    storage=desktopStorage;await desktop.sync();expect(JSON.parse(storage.get('hasimio:settings')!).volume).toBe(0.4);
    storage=phoneStorage;await phone.sync();expect(JSON.parse(storage.get('hasimio:library')!)).toEqual([]);
    await relay.close();relay=createSyncRelay({dataDir:directory,publicUrl:server});storage=new Map();const recovered=new DeviceSync();await recovered.recover(recovery,'Recovered device');expect(resumePosition('movie:tt1')).toBe(120);expect(JSON.parse(storage.get('hasimio:library')!)).toEqual([]);
  });
  it('writes little to storage while a video plays, and loses nothing if the app closes without saving',async()=>{
    const desktop=new DeviceSync();
    storage.set('hasimio:library',JSON.stringify([{id:'tt1',type:'movie',name:'Film'},{id:'tt2',type:'movie',name:'Other'}]));storage.set('hasimio:settings',JSON.stringify({volume:0.6,captionSize:100}));
    saveProgress('movie:tt2',300,1000);saveProgress('movie:tt1',10,1000);
    await desktop.create(server,'Desktop');const invite=await desktop.invitation();await desktop.sync();
    const writes:Record<string,number>={},set=storage.set.bind(storage);storage.set=(key:string,value:string)=>{writes[key]=(writes[key]??0)+1;return set(key,value);};
    // Three progress ticks: each one saves the bookmark, but the sync document waits.
    for(const position of [20,30,40]){saveProgress('movie:tt1',position,1000);desktop.capture();}
    expect(writes).toEqual({'hasimio:playback-progress:v1':3});
    // The upload saves the document once and leaves stores that did not change alone.
    await desktop.sync();
    expect(writes).toEqual({'hasimio:playback-progress:v1':3,'hasimio:sync:document':1});
    // Closing before the deferred save still uploads the newest position on the next start.
    saveProgress('movie:tt1',50,1000);desktop.capture();expect(writes['hasimio:sync:document']).toBe(1);
    vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));
    const restarted=new DeviceSync();restarted.start();await vi.waitFor(()=>expect(restarted.status.state).toBe('ready'));
    storage=new Map();const phone=new DeviceSync();await phone.join(invite.url,'Phone');expect(resumePosition('movie:tt1')).toBe(50);expect(resumePosition('movie:tt2')).toBe(300);
    // Leaving the page saves pending changes at once.
    const phoneStorage=storage;saveProgress('movie:tt1',60,1000);phone.capture();const before=phoneStorage.get('hasimio:sync:document');phone.flush();expect(phoneStorage.get('hasimio:sync:document')).not.toBe(before);
  });
  it('syncs the playing position without rewriting the watch history on either side of the upload',async()=>{
    const desktop=new DeviceSync(),desktopStorage=storage;saveProgress('movie:tt2',300,1000);saveProgress('movie:tt1',10,1000);
    await desktop.create(server,'Desktop');const invite=await desktop.invitation();await desktop.sync();
    const main='hasimio:playback-progress:v1',before=storage.get(main);
    saveProgress('movie:tt1',20,1000,{live:true});await desktop.sync();
    expect(storage.get(main)).toBe(before);expect(storage.has('hasimio:playback-progress:live')).toBe(true);
    storage=new Map();const phone=new DeviceSync();await phone.join(invite.url,'Phone');expect(resumePosition('movie:tt1')).toBe(20);
    // A newer position from the other device replaces the playing position here.
    saveProgress('movie:tt1',700,1000);await phone.sync();
    storage=desktopStorage;await desktop.sync();expect(resumePosition('movie:tt1')).toBe(700);expect(storage.has('hasimio:playback-progress:live')).toBe(false);
  });
  it('saves library and setting changes at once, and marks a save made during an upload as still pending',async()=>{
    const desktop=new DeviceSync();saveProgress('movie:tt1',10,1000);await desktop.create(server,'Desktop');await desktop.sync();
    const saved=()=>JSON.parse(storage.get('hasimio:sync:document')!);
    expect(saved().pending).toBe(false);
    storage.set('hasimio:settings',JSON.stringify({volume:0.2}));desktop.capture();
    expect(saved().pending).toBe(true);expect(JSON.stringify(saved().document)).toContain('setting:volume');
    await desktop.sync();expect(saved().pending).toBe(false);
    // The page is hidden while the upload is in flight: the cache must not claim everything was uploaded.
    saveProgress('movie:tt1',20,1000);desktop.capture();const send=globalThis.fetch;let during:boolean|undefined;
    vi.stubGlobal('fetch',async(url:string,options:RequestInit={})=>{if(options.method==='PUT'&&during===undefined){desktop.flush();during=saved().pending;}return send(url,options);});
    await desktop.sync();expect(during).toBe(true);
    expect(saved().pending).toBe(false);expect(JSON.stringify(saved().document)).toContain('"position":20');
  });
  it('pairs a TV using ephemeral encryption and blocks it after unlinking',async()=>{
    const desktop=new DeviceSync(),desktopStorage=storage;await desktop.create(server,'Desktop');
    storage=new Map();const tvStorage=storage,tv=new DeviceSync(),request=await tv.requestPairing(server,'Living room TV');expect(await tv.pollPairing(request)).toBe(false);
    storage=desktopStorage;const preview=await desktop.previewPairing(request.code);expect(preview.name).toBe('Living room TV');expect(preview.fingerprint).toBe(request.fingerprint);const approver=await desktop.approvePairing(request.code,preview);
    storage=tvStorage;expect(await tv.pollPairing(request)).toBe(approver);expect(tv.status.identity).toBeUndefined();await tv.finishPairing(request);expect(tv.status.identity?.recoveryToken).toBeUndefined();const tvId=tv.status.identity!.deviceId;
    storage=desktopStorage;await desktop.unlink(tvId);storage=tvStorage;await tv.sync();expect(tv.status.state).toBe('revoked');
  });
  it('rejects malformed recovery codes and pairing links with a readable message',async()=>{
    const device=new DeviceSync(),forged=(value:object)=>btoa(JSON.stringify(value)).replace(/=+$/,'');
    await expect(device.recover('hasimio1.not-json','Phone')).rejects.toThrow('Invalid recovery code.');
    await expect(device.recover('hasimio1.'+forged({server:'http://evil.example',spaceId:'a'.repeat(32),key:'x',recoveryToken:'y'}),'Phone')).rejects.toThrow('Invalid recovery code.');
    await expect(device.join('not a link','Phone')).rejects.toThrow('Paste a Hasimio pairing link.');
    await expect(device.join(server+'/#sync-link=garbage','Phone')).rejects.toThrow('Invalid pairing link.');
    expect(device.status.identity).toBeUndefined();expect(storage.size).toBe(0);
  });
});
