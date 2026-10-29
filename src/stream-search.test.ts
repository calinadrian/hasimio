import {afterEach,describe,expect,it,vi} from 'vitest';
import {searchStreams,SOURCE_TIMEOUT_MS,type StreamSearchState} from './stream-search';
import {yts,torrentio} from './catalogs';

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
const response=(name:string)=>new Response(JSON.stringify({streams:[{name,url:`https://example.com/${name}.mp4`}]}));
describe('progressive source search',()=>{
  it('publishes fast sources while a slower extension is still pending, preserving extension order',async()=>{
    let finishSlow!:(value:Response)=>void;
    vi.stubGlobal('fetch',vi.fn((url:string)=>url.includes('/yts/')?new Promise<Response>(resolve=>{finishSlow=resolve;}):Promise.resolve(response('fast'))));
    const states:StreamSearchState[]=[];
    const done=searchStreams([yts,torrentio],'movie','tt123',new AbortController().signal,state=>states.push(state));
    await vi.waitFor(()=>expect(states.at(-1)?.streams[0]?.name).toBe('fast'));
    expect(states.at(-1)?.pending).toBe(1);
    finishSlow(response('slow'));await done;
    expect(states.at(-1)?.streams.map(s=>s.name)).toEqual(['slow','fast']);
    expect(states.at(-1)?.pending).toBe(0);
  });
  it('keeps successful results when another provider fails',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/yts/')?new Response('Unavailable',{status:503}):response('fast')));
    const states:StreamSearchState[]=[];
    await searchStreams([yts,torrentio],'movie','tt123',new AbortController().signal,state=>states.push(state));
    expect(states.at(-1)).toMatchObject({pending:0,failed:['YTS'],streams:[{name:'fast'}]});
  });
  it('stops publishing after navigation aborts the search',async()=>{
    let finish!:(value:Response)=>void;
    vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;})));
    const controller=new AbortController(),update=vi.fn();
    const done=searchStreams([torrentio],'movie','tt123',controller.signal,update);
    expect(update).toHaveBeenCalledTimes(1);
    controller.abort();finish(response('stale'));await done;
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('bounds provider requests and passes navigation cancellation to fetch',async()=>{
    const timeout=vi.spyOn(AbortSignal,'timeout');
    const fetch=vi.fn(async(_url:string,_options:RequestInit)=>response('fast'));vi.stubGlobal('fetch',fetch);
    const controller=new AbortController();
    await searchStreams([torrentio],'movie','tt123',controller.signal,()=>{});
    expect(timeout).toHaveBeenCalledWith(SOURCE_TIMEOUT_MS);
    const signal=fetch.mock.calls[0][1].signal as AbortSignal;
    controller.abort();expect(signal.aborted).toBe(true);timeout.mockRestore();
  });
});
