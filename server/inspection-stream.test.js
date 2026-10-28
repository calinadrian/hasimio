import {describe,it,expect} from 'vitest';
import {Readable} from 'node:stream';
import {once} from 'node:events';
import {inspectionStream} from './inspection-stream.mjs';

describe('inspection read windows',()=>{
  it('reads the requested bytes in small ranges without selecting the whole file',async()=>{
    const source=Buffer.from('0123456789abcdef'),ranges=[];
    const file={createReadStream(range){ranges.push(range);return Readable.from([source.subarray(range.start,range.end+1)]);}};
    const chunks=[];for await(const chunk of inspectionStream(file,{start:2,end:12},4))chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('23456789abc');
    expect(ranges).toEqual([{start:2,end:5},{start:6,end:9},{start:10,end:12}]);
  });
  it('cancels a pending torrent read immediately when FFmpeg closes its request',async()=>{
    let active;const file={createReadStream(){active=new Readable({read(){}});return active;}};
    const stream=inspectionStream(file,{start:0,end:1024**3});stream.resume();
    await new Promise(resolve=>setImmediate(resolve));expect(active.destroyed).toBe(false);
    const closed=once(stream,'close');stream.destroy();await closed;expect(active.destroyed).toBe(true);
  });
});
