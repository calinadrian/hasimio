import {homedir} from 'node:os';
import path from 'node:path';
import {readdir,rm,stat} from 'node:fs/promises';

// Temporary engine data lives in the user's cache folder, not next to the app, so installed copies stay read-only.
export function cacheRoot(env=process.env,platform=process.platform) {
  if(env.HASIMIO_CACHE_DIR)return path.resolve(env.HASIMIO_CACHE_DIR);
  if(platform==='win32')return path.join(env.LOCALAPPDATA||path.join(homedir(),'AppData','Local'),'Hasimio','cache');
  if(platform==='darwin')return path.join(homedir(),'Library','Caches','Hasimio');
  return path.join(env.XDG_CACHE_HOME||path.join(homedir(),'.cache'),'hasimio');
}
export function cacheDir(name) {return path.join(cacheRoot(),name)+path.sep;}
// A database build that dies with the app leaves its temporary file behind, up to hundreds of megabytes each,
// and its name is unique to that run. Files touched within the hour may belong to a build still running.
export async function removeStaleTemps(file,{olderThan=60*60*1000,now=Date.now()}={}) {
  const dir=path.dirname(file),prefix=path.basename(file)+'.';
  let names;try {names=await readdir(dir);}catch {return;}
  for(const name of names){
    if(!name.startsWith(prefix))continue;
    const match=/^(\d+)(?:\.\d+)?\.tmp(?:-journal)?$/.exec(name.slice(prefix.length));
    if(!match)continue;
    const target=path.join(dir,name);
    try {
      if(now-(await stat(target)).mtimeMs<=olderThan)continue;
      try {process.kill(Number(match[1]),0);continue;}catch(error){if(error.code!=='ESRCH')continue;}
      await rm(target,{force:true});
    }catch {/* In use or already gone. */}
  }
}
// Small caches written one row at a time. The default journal creates, syncs and deletes a file for every row;
// a write-ahead log appends instead and syncs only at checkpoints. A crash can lose the newest rows, never the file.
export const CACHE_PRAGMAS='PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;';

// Rebuilds write an unpublished file and rename it after it closes. A larger page
// cache lets the episode and cast passes update dirty pages before SQLite spills them.
export const INDEX_BUILD_PRAGMAS='PRAGMA journal_mode=OFF;PRAGMA synchronous=OFF;PRAGMA cache_size=-32768;';

export function writeCacheBatch(db,write) {
  db.exec('BEGIN');
  try {
    const result=write();
    db.exec('COMMIT');
    return result;
  } catch(error) {
    if(db.isTransaction)db.exec('ROLLBACK');
    throw error;
  }
}
