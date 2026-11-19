import {randomBytes} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadEnv} from 'vite';
import syncService from '../shared/sync-service.json' with {type:'json'};

export async function verifyReleaseRelay(root=fileURLToPath(new URL('..',import.meta.url))){
  const configured=process.env.VITE_SYNC_URL||loadEnv('production',root,'VITE_').VITE_SYNC_URL||syncService.defaultUrl;
  const relay=new URL(configured);
  if(relay.protocol!=='https:'||relay.username||relay.password||relay.pathname!=='/'||relay.search||relay.hash){
    throw Error('A release needs an HTTPS sync service origin.');
  }
  const origin='http://127.0.0.1:11475';
  const acceptsOrigin=response=>['*',origin].includes(response.headers.get('access-control-allow-origin'));
  try{
    const signal=AbortSignal.timeout(12000);
    const options={signal,redirect:'error'};
    const [info,preflight,storage]=await Promise.all([
      fetch(new URL('/api/sync/info',relay),{...options,headers:{Origin:origin}}),
      fetch(new URL('/api/sync/spaces',relay),{...options,method:'OPTIONS',headers:{
        Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type',
      }}),
      // A synthetic, unregistered token exercises storage lookup without creating a group.
      fetch(new URL('/api/sync/spaces/'+randomBytes(16).toString('hex'),relay),{...options,headers:{
        Origin:origin,Authorization:'Bearer '+randomBytes(32).toString('base64url'),
      }}),
    ]);
    const descriptor=info.ok&&await info.json();
    if(descriptor?.version!==1||(descriptor.appUrl&&new URL(descriptor.appUrl).origin!==relay.origin)||!acceptsOrigin(info)){
      throw Error('The service did not return a compatible sync descriptor.');
    }
    const tokens=(response,header)=>(response.headers.get(header)||'').toLowerCase().split(',').map(value=>value.trim());
    const methods=tokens(preflight,'access-control-allow-methods');
    const headers=tokens(preflight,'access-control-allow-headers');
    if(!preflight.ok||!acceptsOrigin(preflight)||!['post','put','delete'].every(method=>methods.includes(method))||
      !['authorization','content-type'].every(header=>headers.includes(header))){
      throw Error('The service did not allow cross-origin sync requests.');
    }
    if(![401,404].includes(storage.status)||!acceptsOrigin(storage)||!(await storage.json()).error){
      throw Error('The service did not complete a sync storage lookup.');
    }
  }catch(error){
    throw Error(`Release blocked: sync service ${relay.origin} did not pass its HTTPS API check. ${error.message}`,{cause:error});
  }
  console.log('Verified release sync relay '+relay.origin);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyReleaseRelay();
