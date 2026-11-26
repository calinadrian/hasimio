import {describe,expect,it} from 'vitest';
import {mkdtemp,readdir,rm,utimes,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {removeStaleTemps,CACHE_PRAGMAS,writeCacheBatch} from './paths.mjs';

describe('engine cache files',()=>{
  it('removes temporary databases left by builds that never finished, and nothing else',async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),'hasimio-paths-'));
    try{
      const old=new Date(Date.now()-2*60*60*1000);
      const active='people.db.'+process.pid+'.123.tmp',abandoned='people.db.2147483647.tmp';
      for(const name of ['people.db',abandoned,abandoned+'-journal','people.db.456.tmp','photos.db','titles.db.9.1.tmp','people.db.notes',active,'people.db.notes.tmp'])await writeFile(path.join(dir,name),'x');
      for(const name of ['people.db',abandoned,abandoned+'-journal','titles.db.9.1.tmp','people.db.notes',active,'people.db.notes.tmp'])await utimes(path.join(dir,name),old,old);
      await removeStaleTemps(path.join(dir,'people.db'));
      // The recent temporary file may belong to a build that is still running.
      expect((await readdir(dir)).sort()).toEqual(['people.db','people.db.456.tmp','people.db.notes','photos.db','titles.db.9.1.tmp',active,'people.db.notes.tmp'].sort());
      await removeStaleTemps(path.join(dir,'missing','people.db'));
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('commits a metadata batch together and rolls it back when a row fails',()=>{
    const db=new DatabaseSync(':memory:');
    try{
      db.exec('CREATE TABLE photos(id INTEGER PRIMARY KEY)');
      const put=db.prepare('INSERT INTO photos VALUES(?)');
      expect(()=>writeCacheBatch(db,()=>{put.run(1);put.run(1);})).toThrow();
      expect(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n).toBe(0);
      writeCacheBatch(db,()=>{put.run(1);put.run(2);});
      expect(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n).toBe(2);
    }finally{db.close();}
  });
  it('opens row-at-a-time caches with a write-ahead log',async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),'hasimio-paths-'));
    try{
      const db=new DatabaseSync(path.join(dir,'cache.db'));db.exec(CACHE_PRAGMAS+'CREATE TABLE t(id TEXT PRIMARY KEY)');
      expect(db.prepare('PRAGMA journal_mode').get().journal_mode).toBe('wal');expect(db.prepare('PRAGMA synchronous').get().synchronous).toBe(1);
      db.prepare('INSERT INTO t VALUES(?)').run('a');db.close();
      const reopened=new DatabaseSync(path.join(dir,'cache.db'),{readOnly:true});expect(reopened.prepare('SELECT id FROM t').get().id).toBe('a');reopened.close();
    }finally{await rm(dir,{recursive:true,force:true});}
  });
});
