import {describe,expect,it} from 'vitest';
import {Readable} from 'node:stream';
import Torrent from 'webtorrent/lib/torrent.js';
import {createMemoryStore,pieceCacheBytes,supportsMemoryStore} from './memory-store.mjs';
import {inspectionStream} from './inspection-stream.mjs';

const call=(store,method,...args)=>new Promise((resolve,reject)=>store[method](...args,(error,value)=>error?reject(error):resolve(value)));
function fakeTorrent(selections=[]) {
  const have=new Set(),unverified=[];let updates=0;
  return {destroyed:false,bitfield:{get:index=>have.has(index)},_selections:selections,have,unverified,get updates(){return updates;},
    _markUnverified(index){have.delete(index);unverified.push(index);},_updateSelections(){updates++;}};
}

describe('memory piece store',()=>{
  it('relies on internals the installed WebTorrent still has',()=>{
    expect(supportsMemoryStore(Torrent.prototype)).toBe(false);
    for(const method of ['_markUnverified','_updateSelections','_gcSelections'])expect(typeof Torrent.prototype[method]).toBe('function');
    expect(()=>new (createMemoryStore(1024))(16,{torrent:{}})).toThrow('cannot keep pieces in memory');
  });
  it('keeps the newest and most recently read pieces within the limit',async()=>{
    const torrent=fakeTorrent(),monitor={},Store=createMemoryStore(0,monitor),store=new Store(4,{torrent});
    // The limit never drops below eight pieces, so a torrent with huge pieces still plays.
    expect(store.limit).toBe(32);
    for(let index=0;index<8;index++){await call(store,'put',index,Buffer.alloc(4,index));torrent.have.add(index);}
    expect(monitor).toMatchObject({bytes:32,pieces:8,evictedPieces:0});
    expect([...await call(store,'get',0,{offset:1,length:2})]).toEqual([0,0]);
    await call(store,'put',8,Buffer.alloc(4,8));torrent.have.add(8);
    // Piece 0 was just read, so piece 1 is the oldest.
    expect(torrent.unverified).toEqual([1]);expect(torrent.updates).toBe(1);
    await expect(call(store,'get',1)).rejects.toThrow('not buffered');
    expect([...await call(store,'get',0)]).toEqual([0,0,0,0]);
    expect(monitor).toMatchObject({bytes:32,pieces:8,evictedPieces:1,evictedBytes:4,writtenBytes:36});
    await expect(call(store,'put',9,Buffer.alloc(5))).rejects.toThrow('piece length');
    await expect(call(store,'get',0,{offset:3,length:4})).rejects.toThrow('Invalid piece range');
    await call(store,'close');expect(monitor).toMatchObject({bytes:0,pieces:0});
    await expect(call(store,'get',0)).rejects.toThrow('not buffered');await expect(call(store,'put',0,Buffer.alloc(4))).rejects.toThrow('stopped');
  });
  it('offers a dropped piece again to readers that had already passed it',async()=>{
    const passed={from:0,to:20,offset:6},behind={from:0,to:20,offset:0},elsewhere={from:10,to:20,offset:4};
    const torrent=fakeTorrent([passed,behind,elsewhere]),store=new (createMemoryStore(0))(4,{torrent});
    for(let index=0;index<9;index++){await call(store,'put',index,Buffer.alloc(4));torrent.have.add(index);}
    expect(torrent.unverified).toEqual([0]);
    expect(passed.offset).toBe(0);expect(behind.offset).toBe(0);expect(elsewhere.offset).toBe(4);
  });
  it('never drops a piece inside a window a reader has open',async()=>{
    const torrent=fakeTorrent(),monitor={},store=new (createMemoryStore(0,monitor))(4,{torrent});
    // Bytes 2 to 9 touch pieces 0, 1 and 2.
    const pin={from:2,to:9};monitor.pins.add(pin);
    for(let index=0;index<12;index++){await call(store,'put',index,Buffer.alloc(4));torrent.have.add(index);}
    expect(torrent.unverified).toEqual([3,4,5,6]);expect(monitor.pieces).toBe(8);
    // With everything pinned the store grows past its limit rather than starve a reader.
    monitor.pins.add({from:0,to:1000});await call(store,'put',12,Buffer.alloc(4));expect(monitor.pieces).toBe(9);
    monitor.pins.clear();await call(store,'put',13,Buffer.alloc(4));expect(monitor.pieces).toBe(8);expect(torrent.unverified).toEqual([3,4,5,6,0,1]);
  });
  it('reads the cache size from megabytes and ignores nonsense',()=>{
    expect(pieceCacheBytes({})).toBe(512*1024*1024);expect(pieceCacheBytes({HASIMIO_PIECE_CACHE_MB:'0'})).toBe(0);
    expect(pieceCacheBytes({HASIMIO_PIECE_CACHE_MB:'256'})).toBe(256*1024*1024);
    expect(pieceCacheBytes({HASIMIO_PIECE_CACHE_MB:'lots'})).toBe(512*1024*1024);expect(pieceCacheBytes({HASIMIO_PIECE_CACHE_MB:'-5'})).toBe(512*1024*1024);
  });
});
describe('read-ahead windows',()=>{
  it('starts the following window early, never more than one, and releases both when the reader leaves',async()=>{
    const source=Buffer.from('0123456789abcdef'),opened=[],streams=[];
    const file={createReadStream(range){opened.push(range.start);const stream=Readable.from([source.subarray(range.start,range.end+1)]);streams.push(stream);return stream;}};
    const chunks=[];for await(const chunk of inspectionStream(file,{start:0,end:15},4,true)){chunks.push(chunk);expect(opened.length).toBeLessThanOrEqual(chunks.length+1);}
    expect(Buffer.concat(chunks).toString()).toBe('0123456789abcdef');expect(opened).toEqual([0,4,8,12]);
    const pending=[],waiting={createReadStream(){const stream=new Readable({read(){}});pending.push(stream);return stream;}};
    const stream=inspectionStream(waiting,{start:0,end:1024},16,true);stream.resume();await new Promise(resolve=>setImmediate(resolve));
    expect(pending).toHaveLength(2);const closed=new Promise(resolve=>stream.once('close',resolve));stream.destroy();await closed;
    expect(pending.every(item=>item.destroyed)).toBe(true);
    // Each window reports the bytes it covers and gives them up when it closes.
    const held=new Set(),seen=[],pinned=(first,last)=>{const key=first+'-'+last;held.add(key);seen.push(key);return()=>held.delete(key);};
    let most=0;for await(const chunk of inspectionStream(file,{start:0,end:15},4,true,pinned)){most=Math.max(most,held.size);expect(chunk.length).toBeGreaterThan(0);}
    await new Promise(resolve=>setImmediate(resolve));
    expect(seen).toEqual(['0-3','4-7','8-11','12-15']);expect(most).toBeLessThanOrEqual(2);expect(held.size).toBe(0);
  });
});
