import {describe,it,expect} from 'vitest';
import {createInspectionScheduler} from './inspection-scheduler.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
describe('parallel source inspection',()=>{
  it('checks four distinct sources by default while keeping further work queued',async()=>{
    const schedule=createInspectionScheduler(),hold=deferred(),started=[];
    const jobs=Array.from({length:5},(_,index)=>schedule(String(index),async()=>{started.push(index);if(index<4)await hold.promise;}));
    await Promise.resolve();expect(started).toEqual([0,1,2,3]);hold.resolve();await Promise.all(jobs);expect(started).toEqual([0,1,2,3,4]);
  });
  it('runs two hashes concurrently while holding a third until capacity is free',async()=>{
    const schedule=createInspectionScheduler(2),a=deferred(),b=deferred(),started=[];
    const first=schedule('a',async()=>{started.push('a');await a.promise;});
    const second=schedule('b',async()=>{started.push('b');await b.promise;});
    const third=schedule('c',()=>{started.push('c');});
    await Promise.resolve();expect(started).toEqual(['a','b']);a.resolve();await first;await third;expect(started).toEqual(['a','b','c']);b.resolve();await second;
  });
  it('serializes a repeated hash while letting a different hash pass it',async()=>{
    const schedule=createInspectionScheduler(2),hold=deferred(),started=[];
    const first=schedule('same',async()=>{started.push('first');await hold.promise;});
    const second=schedule('same',()=>{started.push('second');});
    const other=schedule('other',()=>{started.push('other');});
    await other;expect(started).toEqual(['first','other']);hold.resolve();await Promise.all([first,second]);expect(started).toEqual(['first','other','second']);
  });
  it('cancels queued work without starting another torrent',async()=>{
    const schedule=createInspectionScheduler(1),hold=deferred(),controller=new AbortController();let started=false;
    const first=schedule('a',()=>hold.promise);
    const queued=schedule('b',()=>{started=true;},controller.signal);const rejected=expect(queued).rejects.toThrow('cancelled');controller.abort();await rejected;hold.resolve();await first;expect(started).toBe(false);
  });
});
