import {it,expect} from 'vitest';
import {gzipSync} from 'node:zlib';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createPeopleIndex} from './people.mjs';
const tsv=rows=>gzipSync(rows.map(row=>row.join('\t')).join('\n'));
it('indexes cast names and roles, finds actors and pages their actual movie/series credits',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'hasimio-people-'));
  const titles=Array.from({length:53},(_,i)=>({id:'tt'+i,type:i===52?'series':'movie',name:'Movie '+i,search:'movie '+i,start:2025,votes:1000+i}));
  const files={
    'title.principals.tsv.gz':tsv([['tconst','ordering','nconst','category','job','characters'],...titles.map(t=>[t.id,'1','nm1','actor','\\N','["Lead"]']),['tt0','2','nm2','actress','\\N','["Support"]'],['tt0','3','nm3','director','\\N','\\N'],['tt999','1','nm4','actor','\\N','[]']]),
    'name.basics.tsv.gz':tsv([['nconst','primaryName'],['nm1','Alex Actor'],['nm2','Alex Actor'],['nm3','Crew Name'],['nm4','Outside Catalog']]),
  };
  const requests=[];const index=createPeopleIndex({dir,titleRows:async()=>titles,fetchImpl:async url=>{requests.push(url);return new Response(files[String(url).split('/').at(-1)]);}});
  try{
    await expect(index.search('Alex')).rejects.toMatchObject({status:503,state:'building'});await index.refresh();
    expect(index.status()).toEqual({state:'ready'});
    expect((await index.search('actor alex')).people.map(p=>p.id)).toEqual(['nm1','nm2']);
    expect((await index.cast('tt0')).cast).toEqual([{id:'nm1',name:'Alex Actor',role:'Lead'},{id:'nm2',name:'Alex Actor',role:'Support'}]);
    expect((await index.search('Crew')).people).toEqual([]);expect((await index.search('Outside')).people).toEqual([]);
    const page=await index.credits('nm1');expect(page.metas).toHaveLength(50);expect(page.hasMore).toBe(true);expect(page.metas[0].id).toBe('tt52');
    expect((await index.credits('nm1',50)).metas).toHaveLength(3);
    expect((await index.credits('nm1',0,'series')).metas).toMatchObject([{id:'tt52',type:'series'}]);
    await expect(index.credits('nm1 OR 1=1')).rejects.toMatchObject({status:400});
    expect(requests).toHaveLength(2);await index.close();
    const restarted=createPeopleIndex({dir,titleRows:async()=>{throw Error('Should use existing cache');}});
    expect((await restarted.search('Alex')).people).toHaveLength(2);await restarted.close();
  }finally{await index.close();await rm(dir,{recursive:true,force:true});}
});
it('reports download failures without publishing a partial index',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'hasimio-people-'));
  const index=createPeopleIndex({dir,titleRows:async()=>[],fetchImpl:async()=>new Response('',{status:503})});
  try{await index.refresh();expect(index.status().state).toBe('error');await expect(index.cast('tt1')).rejects.toMatchObject({status:503,state:'error'});}finally{await index.close();await rm(dir,{recursive:true,force:true});}
});
