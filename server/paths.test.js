import {describe,expect,it} from 'vitest';
import {mkdtemp,readdir,rm,utimes,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {removeStaleTemps,CACHE_PRAGMAS} from './paths.mjs';

describe('engine cache files',()=>{
  it('removes temporary databases left by builds that never finished, and nothing else',async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),'hasimio-paths-'));
    try{
      const old=new Date(Date.now()-2*60*60*1000);
      for(const name of ['people.db','people.db.123.tmp','people.db.123.tmp-journal','people.db.456.tmp','photos.db','titles.db.9.1.tmp','people.db.notes'])await writeFile(path.join(dir,name),'x');
      for(const name of ['people.db','people.db.123.tmp','people.db.123.tmp-journal','titles.db.9.1.tmp','people.db.notes'])await utimes(path.join(dir,name),old,old);
      await removeStaleTemps(path.join(dir,'people.db'));
      // The recent temporary file may belong to a build that is still running.
      expect((await readdir(dir)).sort()).toEqual(['people.db','people.db.456.tmp','people.db.notes','photos.db','titles.db.9.1.tmp']);
      await removeStaleTemps(path.join(dir,'missing','people.db'));
    }finally{await rm(dir,{recursive:true,force:true});}
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
