import {homedir} from 'node:os';
import path from 'node:path';

// Temporary engine data lives in the user's cache folder, not next to the app, so installed copies stay read-only.
export function cacheRoot(env=process.env,platform=process.platform) {
  if(env.HASIMIO_CACHE_DIR)return path.resolve(env.HASIMIO_CACHE_DIR);
  if(platform==='win32')return path.join(env.LOCALAPPDATA||path.join(homedir(),'AppData','Local'),'Hasimio','cache');
  if(platform==='darwin')return path.join(homedir(),'Library','Caches','Hasimio');
  return path.join(env.XDG_CACHE_HOME||path.join(homedir(),'.cache'),'hasimio');
}
export function cacheDir(name) {return path.join(cacheRoot(),name)+path.sep;}
