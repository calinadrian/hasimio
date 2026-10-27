// Serves a built Hasimio UI folder: static files only, GET and HEAD, nothing outside the folder.
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.zip':'application/zip'};
// Maps a request path to a file inside root, or undefined. Paths without an extension fall back to index.html.
export function resolveFile(root,urlPath) {
  let decoded;try {decoded=decodeURIComponent(urlPath);}catch {return undefined;}
  if(decoded.includes('\0')||decoded.includes('\\'))return undefined;
  const relative=decoded==='/'||!path.posix.extname(decoded)?'index.html':decoded.replace(/^\/+/,'');
  const file=path.resolve(root,relative),base=path.resolve(root)+path.sep;
  return file.startsWith(base)?file:undefined;
}
export async function serveStatic(root,req,res) {
  const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers,Allow:'GET, HEAD'});return res.end();}
  let pathname;try {pathname=new URL(req.url??'/','http://ui').pathname;}catch {res.writeHead(400,headers);return res.end();}
  const file=resolveFile(root,pathname);
  let info;try {info=file&&await stat(file);}catch {/* Missing files are a 404 below. */}
  if(!info?.isFile()){res.writeHead(404,{...headers,'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found.\n');}
  const type=TYPES[path.extname(file).toLowerCase()]||'application/octet-stream';
  res.writeHead(200,{...headers,'Content-Type':type,'Content-Length':info.size,'Cache-Control':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache',...(type==='application/zip'?{'Content-Disposition':`attachment; filename="${path.basename(file)}"`}:{})});
  if(req.method==='HEAD')return res.end();
  const stream=createReadStream(file);stream.on('error',()=>res.destroy());res.once('close',()=>stream.destroy());stream.pipe(res);
}
