import {describe,it,expect,vi} from 'vitest';
import {discoverSyncService,suggestedDeviceName,defaultSyncService,deviceLabels} from './sync-setup';
const ready=(appUrl?:string)=>new Response(JSON.stringify({version:1,appUrl}),{headers:{'content-type':'application/json'}});
describe('simple sync setup',()=>{
  it('has a built-in public service for normal installations',async()=>{
    const fetcher=vi.fn().mockResolvedValue(ready());
    expect(await discoverSyncService({origin:'http://127.0.0.1:11475',override:'',fetcher})).toBe(defaultSyncService);
  });
  it('uses the publisher configuration without asking for an address',async()=>{
    const fetcher=vi.fn().mockResolvedValue(ready());
    expect(await discoverSyncService({configured:'https://sync.example',origin:'http://127.0.0.1:11475',override:'',fetcher})).toBe('https://sync.example');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('discovers a hosted relay and follows its canonical public address',async()=>{
    expect(await discoverSyncService({configured:'',origin:'https://www.sync.example',override:'',fetcher:vi.fn().mockResolvedValue(ready('https://sync.example'))})).toBe('https://sync.example');
  });
  it('does not mistake a desktop engine or an HTML page for an available sync service',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('<html>App</html>',{headers:{'content-type':'text/html'}}));
    expect(await discoverSyncService({configured:'',origin:'http://127.0.0.1:11475',override:'',fetcher})).toBe('');
    expect(await discoverSyncService({configured:'',origin:'http://public.example',override:'',fetcher})).toBe('');
  });
  it('falls back after an unavailable custom service and rejects insecure canonical addresses',async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(Error('Offline')).mockResolvedValueOnce(ready());
    expect(await discoverSyncService({configured:'https://sync.example',origin:'http://127.0.0.1:11475',override:'https://offline.example',fetcher})).toBe('https://sync.example');
    expect(await discoverSyncService({configured:'',origin:'https://sync.example',override:'',fetcher:vi.fn().mockResolvedValue(ready('http://public.example'))})).toBe('');
  });
  it('suggests familiar names for TVs, phones, and computers',()=>{
    expect(suggestedDeviceName('Mozilla SmartTV Tizen')).toBe('Living room TV');expect(suggestedDeviceName('Mozilla iPhone')).toBe('My iPhone');expect(suggestedDeviceName('Android 15')).toBe('My phone');expect(suggestedDeviceName('Windows NT')).toBe('My PC');
  });
  it('adds the browser so devices of the same kind are distinguishable',()=>{
    const windows='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ';
    expect(suggestedDeviceName(windows+'Chrome/130.0.0.0 Safari/537.36')).toBe('My PC · Chrome');
    expect(suggestedDeviceName(windows+'Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0')).toBe('My PC · Edge');
    expect(suggestedDeviceName(windows+'hasimio/0.1.7 Chrome/130.0.0.0 Electron/33.0.0 Safari/537.36')).toBe('My PC · App');
    expect(suggestedDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('My iPhone · Safari');
    expect(suggestedDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('My Mac · Firefox');
  });
  it('numbers devices that still share a name, oldest first',()=>{
    const labels=deviceLabels([{id:'c',name:'My PC · Chrome',addedAt:3},{id:'a',name:'My PC · Chrome',addedAt:1},{id:'b',name:'Living room TV',addedAt:2}]);
    expect(labels.get('a')).toBe('My PC · Chrome');expect(labels.get('c')).toBe('My PC · Chrome (2)');expect(labels.get('b')).toBe('Living room TV');
  });
});
