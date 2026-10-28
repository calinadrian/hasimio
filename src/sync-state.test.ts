import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {emptyDocument,captureChanges,mergeDocuments,compactDocument,validDocument,localValues,applyDocument} from './sync-state';
import {seal,unseal,randomKey,pairingKey,pairingFingerprint,sharedKey,serviceUrl} from './sync-crypto';
import {yts,eztv,torrentDownloads} from './catalogs';
const a='a'.repeat(32),b='b'.repeat(32);
let storage:Map<string,string>;
beforeEach(()=>{storage=new Map();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});vi.stubGlobal('window',new EventTarget());});
afterEach(()=>vi.unstubAllGlobals());
describe('offline device merging',()=>{
  it('syncs the TorrentDownloads extension and its disabled setting',()=>{
    const source={...torrentDownloads,enabled:false};applyDocument(captureChanges(emptyDocument(),a,{},{['addon:'+torrentDownloads.manifest.id]:source},100));
    expect(localValues()['addon:'+torrentDownloads.manifest.id]).toEqual(source);
  });
  it('syncs EZTV and preserves its disabled setting',()=>{
    const source={...eztv,enabled:false};applyDocument(captureChanges(emptyDocument(),a,{},{['addon:'+eztv.manifest.id]:source},100));
    expect(localValues()['addon:'+eztv.manifest.id]).toEqual(source);
  });
  it('syncs the YTS extension and its disabled setting between devices',()=>{
    const source={...yts,enabled:false};
    const doc=captureChanges(emptyDocument(),a,{},{['addon:'+yts.manifest.id]:source},100);
    applyDocument(doc);expect(localValues()['addon:'+yts.manifest.id]).toEqual(source);
  });
  it('merges independent edits, preserves removals, and accepts rewinding progress',()=>{
    const initial=captureChanges(emptyDocument(),a,{}, {'library:movie:tt1':{id:'tt1',type:'movie',name:'Film'},'setting:volume':0.8,'setting:rate':1,'progress:movie:tt1':{position:500,duration:1000,updatedAt:1,completed:false}},100);
    const first=captureChanges(initial,a,{'library:movie:tt1':{id:'tt1',type:'movie',name:'Film'},'setting:volume':0.8},{'setting:volume':0.5},200);
    const second=captureChanges(initial,b,{'setting:rate':1,'progress:movie:tt1':{position:500,duration:1000,updatedAt:1,completed:false}},{'setting:rate':1.5,'progress:movie:tt1':{position:100,duration:1000,updatedAt:300,completed:false}},300);
    const merged=mergeDocuments(first,second);expect(merged.records['library:movie:tt1'].value).toBeNull();expect(merged.records['setting:volume'].value).toBe(0.5);expect(merged.records['setting:rate'].value).toBe(1.5);expect((merged.records['progress:movie:tt1'].value as {position:number}).position).toBe(100);
    expect(mergeDocuments(second,first)).toEqual(merged);
  });
  it('does not resurrect a removed title because an offline provider refreshed its artwork',()=>{
    const before={'library:movie:tt1':{id:'tt1',type:'movie',name:'Film',poster:'old'}};
    const initial=captureChanges(emptyDocument(),a,{},before,100),removed=captureChanges(initial,b,before,{},200);
    const hydrated=captureChanges(initial,a,before,{'library:movie:tt1':{...before['library:movie:tt1'],poster:'new'}},300);
    expect(mergeDocuments(hydrated,removed).records['library:movie:tt1'].value).toBeNull();
  });
  it('applies validated data and preserves local provider metadata for saved titles',()=>{
    storage.set('hasimio:library',JSON.stringify([{id:'tt1',type:'movie',name:'Film',description:'Provider metadata',metadataFetchedAt:100}]));
    const doc=validDocument(captureChanges(emptyDocument(),a,{}, {'library:movie:tt1':{id:'tt1',type:'movie',name:'Film'},'setting:volume':0.6},100));applyDocument(doc);
    expect(JSON.parse(storage.get('hasimio:library')!)[0].description).toBe('Provider metadata');expect(localValues()['setting:volume']).toBe(0.6);
    applyDocument(validDocument({v:1,records:{'setting:volume':{stamp:1,device:a,value:999}}}));expect(localValues()['setting:volume']).toBeUndefined();
    expect(()=>validDocument({v:1,records:{'setting:volume':{stamp:-1,device:a,value:1}}})).toThrow();
  });
  it('keeps records from newer app versions without applying them',()=>{
    const future={'setting:futureKey':{stamp:50,device:b,value:'x'},'watchlist:movie:tt9':{stamp:51,device:b,value:{id:'tt9'}},'later:tt9':{stamp:52,device:b,value:null}};
    const remote=validDocument({v:1,records:future}),local=captureChanges(emptyDocument(),a,{},{'setting:volume':0.5},100);
    const merged=compactDocument(mergeDocuments(local,remote),200);expect(merged.records['setting:futureKey']).toEqual(future['setting:futureKey']);expect(merged.records['watchlist:movie:tt9']).toEqual(future['watchlist:movie:tt9']);
    applyDocument(merged);expect(JSON.parse(storage.get('hasimio:settings')!)).toEqual({volume:0.5});
    const next=captureChanges(merged,a,localValues(),{'setting:volume':0.7},300);expect(next.records['setting:futureKey']).toEqual(future['setting:futureKey']);expect(next.records['later:tt9']).toEqual(future['later:tt9']);
  });
  it('keeps the library order of this device and appends titles from others',()=>{
    storage.set('hasimio:library',JSON.stringify([{id:'tt2',type:'movie',name:'Second'},{id:'tt1',type:'movie',name:'First'}]));
    applyDocument(captureChanges(emptyDocument(),a,{},{'library:movie:tt1':{id:'tt1',type:'movie',name:'First'},'library:movie:tt3':{id:'tt3',type:'movie',name:'Third'},'library:movie:tt2':{id:'tt2',type:'movie',name:'Second'}},100));
    expect(JSON.parse(storage.get('hasimio:library')!).map((m:{id:string})=>m.id)).toEqual(['tt2','tt1','tt3']);
  });
  it('bounds playback history and expires old removals so sync never outgrows its limits',()=>{
    const day=24*60*60*1000,now=200*day,progress=(i:number)=>({position:1,duration:10,updatedAt:i,completed:false});
    const previous=Object.fromEntries(Array.from({length:600},(_,i)=>['progress:movie:tt'+i,progress(i)]));
    const current=Object.fromEntries(Object.entries(previous).slice(100));
    let doc=captureChanges(emptyDocument(),a,{},{...previous,'setting:volume':0.5},now-100*day);
    doc=captureChanges(doc,a,{...previous,'setting:volume':0.5},current,now-100*day);
    expect(Object.values(doc.records).filter(r=>r.value===null)).toHaveLength(1);
    const compacted=compactDocument(mergeDocuments(doc,captureChanges(emptyDocument(),b,{},{'setting:rate':1.5},now)),now);
    expect(Object.keys(compacted.records).filter(k=>k.startsWith('progress:'))).toHaveLength(500);
    expect(compacted.records['progress:movie:tt599']).toBeDefined();expect(compacted.records['progress:movie:tt99']).toBeUndefined();
    expect(compacted.records['setting:volume']).toBeUndefined();expect(compacted.records['setting:rate'].value).toBe(1.5);
    expect(compactDocument(doc,now-50*day).records['setting:volume'].value).toBeNull();
  });
});
describe('sync encryption and pairing',()=>{
  it('round trips encrypted data and rejects wrong keys and tampered ciphertext',async()=>{
    const key=randomKey(),payload={library:['Private title'],progress:120},sealed=await seal(payload,key);
    expect(JSON.stringify(sealed)).not.toContain('Private title');expect(await unseal(sealed,key)).toEqual(payload);
    await expect(unseal(sealed,randomKey())).rejects.toThrow('decrypted');
    await expect(unseal({...sealed,data:(sealed.data[0]==='A'?'B':'A')+sealed.data.slice(1)},key)).rejects.toThrow('decrypted');
  });
  it('transfers credentials only through the requesting device’s ephemeral key',async()=>{
    const first=await pairingKey(),second=await pairingKey(),wrong=await pairingKey();
    const left=await sharedKey(first.privateKey,second.publicKey),right=await sharedKey(second.privateKey,first.publicKey);expect(left).toBe(right);
    const bundle=await seal({key:randomKey()},left,'Hasimio pairing v1');expect(await unseal(bundle,right,'Hasimio pairing v1')).toHaveProperty('key');
    await expect(unseal(bundle,await sharedKey(wrong.privateKey,first.publicKey),'Hasimio pairing v1')).rejects.toThrow();
  });
  it('derives a stable 40-bit fingerprint that differs between pairing keys',async()=>{
    const first=await pairingKey(),second=await pairingKey(),value=await pairingFingerprint(first.publicKey);
    expect(value).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);expect(await pairingFingerprint({...first.publicKey})).toBe(value);expect(await pairingFingerprint(second.publicKey)).not.toBe(value);
  });
  it('requires HTTPS except for loopback development',()=>{
    expect(serviceUrl('https://sync.example.com/')).toBe('https://sync.example.com');expect(serviceUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
    for(const value of ['http://public.example','https://user:secret@sync.example','https://sync.example/path'])expect(()=>serviceUrl(value)).toThrow();
  });
});
