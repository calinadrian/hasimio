import {beforeEach,expect,test,vi} from 'vitest';
import {profileStorage} from './profile-storage';
import {applyDocument,captureChanges,documentValues,emptyDocument,localValues} from './sync-state';

const quota=400000;
const library=(name:string,count:number)=>Array.from({length:count},(_,i)=>({id:name+i,type:'series',name:'Țară '+name+i,poster:'https://images.example.com/poster/'+name+i+'.jpg',description:'A long description. '.repeat(20)}));
const slim=(name:string,count:number)=>library(name,count).map(({description:_,...meta})=>meta);
let data:Map<string,string>;
beforeEach(()=>{
  data=new Map();
  const used=()=>[...data].reduce((sum,[key,value])=>sum+key.length+value.length,0);
  vi.stubGlobal('localStorage',{
    get length(){return data.size;},key:(i:number)=>[...data.keys()][i]??null,
    getItem:(key:string)=>data.get(key)??null,removeItem:(key:string)=>{data.delete(key);},
    setItem:(key:string,value:string)=>{
      const old=data.get(key);data.set(key,value);
      if(used()>quota&&value.length>(old?.length??0)){if(old===undefined)data.delete(key);else data.set(key,old);throw new DOMException("Failed to execute 'setItem' on 'Storage': exceeded the quota.",'QuotaExceededError');}
    },
  });
  vi.stubGlobal('window',new EventTarget());
});
test('stores plainly while there is room',()=>{
  const text=JSON.stringify(library('a',50));profileStorage.setItem('hasimio:library',text);
  expect(data.get('hasimio:library')).toBe(text);
});
test('a first sync finishes when the library exceeds the quota, and nothing looks deleted',()=>{
  const other='hasimio:profile:'+'b'.repeat(32)+':library',otherText=JSON.stringify(library('b',600));data.set(other,otherText);
  const titles=slim('a',4500);
  const document=captureChanges(emptyDocument(),'a'.repeat(32),{},Object.fromEntries(titles.map(meta=>['library:series:'+meta.id,meta])));
  expect(()=>localStorage.setItem('hasimio:library',JSON.stringify(titles))).toThrow(/quota/);
  applyDocument(document);
  expect(JSON.parse(profileStorage.getItem('hasimio:library')!)).toEqual(titles);
  expect(data.get('hasimio:library')!.startsWith('gz1:')).toBe(true);
  const next=captureChanges(document,'a'.repeat(32),documentValues(document),localValues());
  expect(Object.values(next.records).some(record=>record.value===null)).toBe(false);
  expect(data.has(other)).toBe(true);
});
test('a value stays compressed on later writes',()=>{
  profileStorage.setItem('hasimio:library',JSON.stringify(library('a',1500)));
  const edited=JSON.stringify(library('a',100));profileStorage.setItem('hasimio:library',edited);
  expect(data.get('hasimio:library')!.startsWith('gz1:')).toBe(true);expect(profileStorage.getItem('hasimio:library')).toBe(edited);
});
test('only refetchable caches are dropped, and the failure is explained when nothing helps',()=>{
  data.set('hasimio:verified-tracks','x'.repeat(100000));data.set('hasimio:sync:identity','keep');
  profileStorage.setItem('hasimio:big','y'.repeat(350000));
  expect(data.has('hasimio:verified-tracks')).toBe(false);expect(data.get('hasimio:sync:identity')).toBe('keep');
  expect(()=>profileStorage.setItem('hasimio:bigger','z'.repeat(350000))).toThrow(/storage this browser allows/);
  expect(data.has('hasimio:big')).toBe(true);
});
