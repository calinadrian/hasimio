import {describe,expect,it} from 'vitest';
import {cachedHomeRows,cachedRow,mergeRows,storeHomeRows} from './home-cache';
import {kitsu,titles,type CatalogRow} from './catalogs';
import type {Addon,Meta} from './media';

const memory=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},values};};
const meta=(id:string,extra:Partial<Meta>={}):Meta=>({id,type:'movie',name:'Title '+id,...extra});
function rowFor(addon:Addon,index:number,items:Meta[]):CatalogRow{
  const catalog=addon.manifest.catalogs[index];
  return {key:`${addon.manifest.id}:${catalog.type}:${catalog.id}`,title:catalog.name??'Row',source:addon.manifest.name,items,addon,catalog,skip:items.length,hasMore:true};
}
const plain=(row:CatalogRow)=>({key:row.key,items:row.items.map(item=>item.id)});

describe('home rows from the last visit',()=>{
  it('restores saved rows for the sources that are still enabled, in catalog order',()=>{
    const storage=memory();
    const first=rowFor(titles,0,[meta('a'),meta('b')]),anime=rowFor(kitsu,0,[meta('k',{type:'series'})]);
    storeHomeRows([anime,first],storage);
    const restored=cachedHomeRows([titles,kitsu],storage);
    expect(restored.map(plain)).toEqual([plain(first),plain(anime)]);
    expect(restored.every(cachedRow)).toBe(true);
    // Restored rows wait for their catalog before loading further pages.
    expect(restored.every(row=>!row.hasMore)).toBe(true);
    expect(restored[0].addon).toBe(titles);
    // A source the viewer has since disabled is not shown.
    expect(cachedHomeRows([titles,{...kitsu,enabled:false}],storage).map(row=>row.key)).toEqual([first.key]);
  });

  it('keeps only what posters and the spotlight need',()=>{
    const storage=memory();
    const long='word '.repeat(200);
    storeHomeRows([rowFor(titles,0,[meta('a',{description:long,videos:[{id:'a:1:1',title:'Pilot'}],metadataFetchedAt:5,background:'https://img/a.jpg'})])],storage);
    const [item]=cachedHomeRows([titles],storage)[0].items;
    expect(item.videos).toBeUndefined();
    expect(item.metadataFetchedAt).toBeUndefined();
    expect(item.background).toBe('https://img/a.jpg');
    expect(item.description!.length).toBeLessThanOrEqual(321);
    expect(item.description!.endsWith('…')).toBe(true);
  });

  it('ignores a missing or damaged copy',()=>{
    expect(cachedHomeRows([titles],memory())).toEqual([]);
    const storage=memory();storage.setItem('hasimio:home-rows:v1','{not json');
    expect(cachedHomeRows([titles],storage)).toEqual([]);
  });
});

describe('merging fresh rows into the shelves on screen',()=>{
  const keys=['one','two','three'];
  const row=(key:string,ids:string[],extra:Partial<CatalogRow>={})=>({...rowFor(titles,0,ids.map(id=>meta(id))),key,...extra});
  it('replaces each shelf in place as its catalog answers and keeps the others until they do',()=>{
    const previous=[row('one',['old1']),row('two',['old2']),row('three',['old3'])];
    const fresh=new Map([['two',row('two',['new2'])]]);
    expect(mergeRows(keys,fresh,previous,new Set(),false).map(plain)).toEqual([{key:'one',items:['old1']},{key:'two',items:['new2']},{key:'three',items:['old3']}]);
  });
  it('keeps pages loaded since a shelf was replaced',()=>{
    const paged=row('one',['page2']);
    const fresh=new Map([['one',row('one',['page1'])],['two',row('two',['new2'])]]);
    expect(mergeRows(keys,fresh,[paged,row('two',['old2'])],new Set(['one']),false).map(plain)).toEqual([{key:'one',items:['page2']},{key:'two',items:['new2']}]);
  });
  it('drops shelves whose catalog did not answer once the request ends',()=>{
    const fresh=new Map([['one',row('one',['new1'])]]);
    expect(mergeRows(keys,fresh,[row('one',['new1']),row('three',['old3'])],new Set(['one']),true).map(plain)).toEqual([{key:'one',items:['new1']}]);
  });
});
