import {beforeEach,describe,expect,it,vi} from 'vitest';

let storage:Map<string,string>;
beforeEach(()=>{
  vi.resetModules();
  storage=new Map();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
});

describe('card size',()=>{
  it('defaults to medium and ignores unknown values',async()=>{
    const {currentCardSize,parseCardSize}=await import('./card-size');
    expect(currentCardSize()).toBe('medium');
    storage.set('hasimio:card-size','huge');
    expect(currentCardSize()).toBe('medium');
    storage.set('hasimio:card-size','small');
    expect(currentCardSize()).toBe('small');
    expect(parseCardSize(undefined)).toBe('medium');
  });
  it('remembers the choice for this profile',async()=>{
    const {savedCardSize,setCardSize}=await import('./card-size');
    setCardSize('large');
    expect(storage.get('hasimio:card-size')).toBe('large');
    expect(savedCardSize()).toBe('large');
  });
  it('keeps the choice for this session when it cannot be saved',async()=>{
    storage.set('hasimio:card-size','small');
    vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:()=>{throw Error('QuotaExceededError');},removeItem:()=>{}});
    const {currentCardSize,savedCardSize,setCardSize}=await import('./card-size');
    expect(()=>setCardSize('large')).not.toThrow();
    expect(currentCardSize()).toBe('large');
    expect(savedCardSize()).toBe('small');
  });
});
