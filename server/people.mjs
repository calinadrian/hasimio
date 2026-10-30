import {DatabaseSync} from 'node:sqlite';
import {mkdir,rename,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {datasetRows,normalize,titleMeta} from './title-index.mjs';

const fields=['id','type','name','search','start','end','runtime','genres','rating','votes'];
const fail=(message,status=503,state='error')=>Object.assign(new Error(message),{status,state});
export async function buildPeopleIndex(file,{titleRows,fetchImpl=fetch,signal,onStep=()=>{}}){
  const titles=await titleRows(),ids=new Set(titles.map(t=>t.id)),people=new Set();
  const db=new DatabaseSync(file);
  try{
    db.exec(`PRAGMA journal_mode=OFF;PRAGMA synchronous=OFF;
      CREATE TABLE titles(id TEXT PRIMARY KEY,type TEXT,name TEXT,search TEXT,start INTEGER,end INTEGER,runtime INTEGER,genres TEXT,rating REAL,votes INTEGER) WITHOUT ROWID;
      CREATE TABLE people(id TEXT PRIMARY KEY,name TEXT,search TEXT) WITHOUT ROWID;
      CREATE TABLE credits(title TEXT,person TEXT,ordering INTEGER,role TEXT,PRIMARY KEY(title,person)) WITHOUT ROWID;
      CREATE TABLE info(built INTEGER);BEGIN;`);
    const addTitle=db.prepare('INSERT INTO titles VALUES(?,?,?,?,?,?,?,?,?,?)');
    for(const title of titles)addTitle.run(...fields.map(key=>title[key]??null));
    const add=db.prepare('INSERT OR IGNORE INTO credits VALUES(?,?,?,?)');
    onStep('Downloading cast credits');
    for await(const [title,ordering,person,category,,characters] of datasetRows('title.principals.tsv.gz',fetchImpl,signal)){
      if(!ids.has(title)||!['actor','actress'].includes(category)||!/^nm\d+$/.test(person))continue;
      let role='';try{const names=JSON.parse(characters);if(Array.isArray(names))role=names.filter(n=>typeof n==='string').join(', ').slice(0,500);}catch{/* Role unannounced. */}
      people.add(person);add.run(title,person,Number(ordering)||0,role);
    }
    onStep('Downloading actor names');
    const addPerson=db.prepare('INSERT OR IGNORE INTO people VALUES(?,?,?)');
    for await(const [id,name] of datasetRows('name.basics.tsv.gz',fetchImpl,signal))if(people.has(id)&&name&&name!=='\\N')addPerson.run(id,name,normalize(name));
    db.exec('DELETE FROM credits WHERE person NOT IN (SELECT id FROM people);CREATE INDEX credits_person ON credits(person);COMMIT;');
    db.prepare('INSERT INTO info VALUES(?)').run(Date.now());
    return db.prepare('SELECT COUNT(*) AS n FROM people').get().n;
  }finally{db.close();}
}
export function createPeopleIndex({dir,titleRows,fetchImpl=fetch}){
  const file=path.join(dir,'people.db'),controller=new AbortController();
  let db,building,closed=false,status={state:'idle'};
  async function refresh(){
    if(closed)return;
    if(building)return building;
    building=(async()=>{
      const temp=file+'.'+process.pid+'.tmp';
      try{
        await mkdir(dir,{recursive:true});status={state:'building',step:'Preparing title list'};
        await buildPeopleIndex(temp,{titleRows,fetchImpl,signal:controller.signal,onStep:step=>{status={state:'building',step};}});
        db?.close();db=undefined;await rename(temp,file);status={state:'ready'};
      }catch(error){status={state:'error',error:error.message};await rm(temp,{force:true}).catch(()=>{});}
      finally{building=undefined;}
    })();return building;
  }
  async function ready(){
    if(closed)throw fail('Actor index is closed.');
    if(!db){try{await stat(file);db=new DatabaseSync(file,{readOnly:true});}catch{}}
    if(db){
      const built=db.prepare('SELECT built FROM info').get()?.built;
      if(Date.now()-built>7*24*60*60*1000&&!building&&status.state!=='error')void refresh();
      return db;
    }
    if(status.state==='error')throw fail('Actor index could not be prepared. '+status.error);
    void refresh();throw fail('Preparing cast and actor search for the first time. This is a large one-time download of IMDb cast credits and names and can take several minutes.',503,'building');
  }
  async function search(query){
    const words=normalize(query).split(' ').filter(Boolean).slice(0,12);if(!words.length)return {people:[]};
    const index=await ready();
    return {people:index.prepare(`SELECT p.id,p.name,COUNT(c.title) AS titles FROM people p JOIN credits c ON c.person=p.id WHERE ${words.map(()=>"instr(p.search,?)>0").join(' AND ')} GROUP BY p.id ORDER BY (p.search=?) DESC,titles DESC,p.name LIMIT 20`).all(...words,normalize(query))};
  }
  async function cast(id){
    if(!/^tt\d+$/.test(id))throw fail('Invalid title ID.',400);
    return {cast:(await ready()).prepare('SELECT p.id,p.name,c.role FROM credits c JOIN people p ON p.id=c.person WHERE c.title=? ORDER BY c.ordering LIMIT 30').all(id)};
  }
  async function credits(id,skip=0,type){
    if(!/^nm\d+$/.test(id))throw fail('Invalid actor ID.',400);
    const index=await ready(),person=index.prepare('SELECT id,name FROM people WHERE id=?').get(id);
    if(!person)throw fail('Actor not found in Hasimio’s index.',404);
    const filtered=['movie','series'].includes(type);
    const rows=index.prepare(`SELECT t.* FROM titles t JOIN credits c ON c.title=t.id WHERE c.person=? ${filtered?'AND t.type=?':''} ORDER BY t.votes DESC,t.start DESC,t.id LIMIT 50 OFFSET ?`).all(id,...(filtered?[type]:[]),Math.min(100000,Math.max(0,Math.floor(Number(skip)||0))));
    return {person,metas:rows.map(row=>titleMeta(row)),hasMore:rows.length===50};
  }
  async function close(){closed=true;controller.abort();await building;db?.close();db=undefined;}
  return {search,cast,credits,refresh,status:()=>status,close};
}
