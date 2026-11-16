import {describe,expect,it} from 'vitest';
import {jsonBytes,readJsonBytes,readStoredJson,storedJson} from './compact-json';

describe('compact saved data',()=>{
  const large={records:Object.fromEntries(Array.from({length:2000},(_,index)=>['series:tt'+index,{position:index,title:'Episodul '+index+' — știri'}]))};
  it('keeps small values as plain JSON',()=>{
    expect(storedJson({a:1})).toBe('{"a":1}');
    expect(readStoredJson('{"a":1}')).toEqual({a:1});
  });
  it('round-trips large values through compressed storage text',()=>{
    const text=storedJson(large);
    expect(text.startsWith('gz1:')).toBe(true);
    expect(text.length).toBeLessThan(JSON.stringify(large).length);
    expect(readStoredJson(text)).toEqual(large);
  });
  it('round-trips compressed bytes and rejects damaged ones',()=>{
    const bytes=jsonBytes(large,1024);
    expect([bytes[0],bytes[1]]).toEqual([31,139]);
    expect(readJsonBytes(bytes)).toEqual(large);
    expect(()=>readJsonBytes(bytes.subarray(0,bytes.length>>1))).toThrow();
  });
});
