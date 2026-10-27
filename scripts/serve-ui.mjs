// Serves a built Hasimio UI folder (static files only) for people outside this PC.
// node scripts/serve-ui.mjs --dir release/ui [--port 5199] [--host 0.0.0.0]
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveStatic} from '../server/static-ui.mjs';

export function serveUi(root) {
  return createServer((req,res)=>{
    console.log(`${new Date().toISOString()} ${req.socket.remoteAddress} ${req.method} ${req.url}`);
    void serveStatic(root,req,res);
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const options={dir:undefined,port:5199,host:'0.0.0.0'};const argv=process.argv.slice(2);
  for(let i=0;i<argv.length;i++){if(argv[i]==='--dir')options.dir=argv[++i];else if(argv[i]==='--port')options.port=Number(argv[++i]);else if(argv[i]==='--host')options.host=argv[++i];else {console.error(`Unknown option: ${argv[i]}`);process.exit(2);}}
  if(!options.dir){console.error('--dir <built UI folder> is required.');process.exit(2);}
  const root=path.resolve(options.dir);
  serveUi(root).on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${options.port} is already in use.`:error.message);process.exit(1);}).listen(options.port,options.host,()=>console.log(`Serving ${root} on http://${options.host}:${options.port} (static files only). Ctrl+C to stop.`));
}
