import {useSyncExternalStore} from 'react';
import {randomDeviceId,randomKey,seal,unseal,serviceUrl,pairingKey,pairingFingerprint,sharedKey,encode,decode,type Sealed} from './sync-crypto';
import {emptyDocument,localValues,captureChanges,mergeDocuments,compactDocument,validDocument,applyDocument,sameDocument,type SyncDocument} from './sync-state';

export type Identity={server:string;spaceId:string;deviceId:string;deviceToken:string;key:string;name:string;recoveryToken?:string};
type Device={id:string;name:string;addedAt:number;lastSeen:number};
type Status={identity?:Identity;state:'off'|'syncing'|'ready'|'offline'|'revoked';error?:string;lastSynced?:number;devices:Device[];appUrl?:string};
const identityKey='hasimio:sync:identity',documentKey='hasimio:sync:document';
function read(key:string){try{return JSON.parse(localStorage.getItem(key)??'null');}catch{return null;}}
function validIdentity(value:unknown):value is Identity{const v=value as Identity;try{return !!v&&serviceUrl(v.server)===v.server&&/^[a-f\d]{32}$/.test(v.spaceId)&&/^[a-f\d]{32}$/.test(v.deviceId)&&decode(v.key).length===32&&decode(v.deviceToken).length===32&&typeof v.name==='string'&&(v.recoveryToken===undefined||decode(v.recoveryToken).length===32);}catch{return false;}}
function payload(text:string,message:string){try{const value=JSON.parse(new TextDecoder().decode(decode(text)));if(value&&typeof value==='object')return value as Record<string,unknown>;}catch{/* Reported below. */}throw Error(message);}
export async function syncRequest<T>(server:string,route:string,options:{method?:string;body?:unknown;token?:string}={}):Promise<T>{
  const response=await fetch(serviceUrl(server)+'/api/sync/'+route,{method:options.method??'GET',headers:{...(options.body!==undefined?{'Content-Type':'application/json'}:{}),...(options.token?{Authorization:'Bearer '+options.token}:{})},body:options.body!==undefined?JSON.stringify(options.body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
  let value;try{value=await response.json();}catch{throw Error('This address is not a Hasimio sync service.');}
  if(!response.ok)throw Object.assign(Error(value.error||'The sync service did not respond.'),{status:response.status});return value as T;
}
export class DeviceSync {
  status:Status={state:'off',devices:[]};listeners=new Set<()=>void>();document:SyncDocument=emptyDocument();observed:Record<string,unknown>={};private running=false;private timer:ReturnType<typeof setInterval>|undefined;private scheduled:ReturnType<typeof setTimeout>|undefined;private applied=false;private lastAttempt=0;private dirty=false;
  private publish(update:Partial<Status>){this.status={...this.status,...update};for(const listener of this.listeners)listener();}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  snapshot=()=>this.status;
  private persist(){localStorage.setItem(documentKey,JSON.stringify({spaceId:this.status.identity?.spaceId,document:this.document,observed:this.observed}));}
  capture=()=>{
    if(this.applied||!this.status.identity)return;
    try{const current=localValues();this.document=captureChanges(this.document,this.status.identity.deviceId,this.observed,current);this.observed=current;this.persist();}catch(error){this.publish({state:'offline',error:error instanceof Error?error.message:'Could not save pending sync changes.'});}
  };
  changed=()=>{if(this.applied)return;this.capture();if(!this.status.identity||this.status.state==='revoked')return;if(this.running)this.dirty=true;if(this.scheduled)return;this.scheduled=setTimeout(()=>{this.scheduled=undefined;void this.sync();},Math.max(1000,5000-(Date.now()-this.lastAttempt)));};
  start(){
    if(this.timer)return;const identity=read(identityKey);
    if(validIdentity(identity)){
      const saved=read(documentKey);try{if(saved?.spaceId===identity.spaceId){this.document=validDocument(saved.document);this.observed=saved.observed??{};}}catch{/* Rebuild from the device's own data. */}
      this.publish({identity,state:'syncing'});void this.sync();
    }
    this.timer=setInterval(()=>{if(this.status.identity&&this.status.state!=='revoked'&&document.visibilityState!=='hidden')void this.sync();},15000);
    window.addEventListener('hasimio:local-data',this.changed);window.addEventListener('hasimio:playback-progress',this.changed);window.addEventListener('online',this.changed);window.addEventListener('pagehide',this.capture);
    document.addEventListener('visibilitychange',this.visibility);
  }
  private visibility=()=>{this.capture();if(document.visibilityState==='visible')void this.sync();};
  private setIdentity(identity:Identity,joining=false){
    localStorage.setItem(identityKey,JSON.stringify(identity));this.document=captureChanges(emptyDocument(),identity.deviceId,{},localValues(),joining?0:Date.now());this.observed=localValues();this.publish({identity,state:'syncing',error:undefined,devices:[]});this.persist();
  }
  async create(server:string,name:string){
    server=serviceUrl(server);const info=await syncRequest<{version:number;appUrl:string}>(server,'info');if(info.version!==1)throw Error('Unsupported sync service version.');
    const identity={server,name,deviceId:randomDeviceId(),deviceToken:randomKey(),key:randomKey(),recoveryToken:randomKey(),spaceId:''};
    const initial=captureChanges(emptyDocument(),identity.deviceId,{},localValues());
    const created=await syncRequest<{spaceId:string}>(server,'spaces',{method:'POST',body:{deviceId:identity.deviceId,name,deviceToken:identity.deviceToken,recoveryToken:identity.recoveryToken,data:await seal(initial,identity.key)}});
    identity.spaceId=created.spaceId;this.setIdentity(identity);this.publish({appUrl:info.appUrl||server});await this.sync();return this.recoveryCode();
  }
  async sync(){
    const identity=this.status.identity;if(!identity||this.running)return;this.running=true;this.dirty=false;this.lastAttempt=Date.now();this.publish({state:'syncing',error:undefined});
    try{
      for(let attempt=0;attempt<4;attempt++){
        this.capture();const remote=await syncRequest<{revision:number;data:Sealed;devices:Device[]}>(identity.server,'spaces/'+identity.spaceId,{token:identity.deviceToken});
        const incoming=validDocument(await unseal(remote.data,identity.key));this.capture();const merged=compactDocument(mergeDocuments(this.document,incoming));
        if(!sameDocument(merged,incoming)){
          const data=await seal(merged,identity.key);
          try{await syncRequest(identity.server,'spaces/'+identity.spaceId,{method:'PUT',token:identity.deviceToken,body:{baseRevision:remote.revision,data}});}catch(error){if((error as {status?:number}).status===409)continue;throw error;}
        }
        if(this.status.identity!==identity)return;this.capture();this.document=compactDocument(mergeDocuments(this.document,merged));
        this.applied=true;try{applyDocument(this.document);this.observed=localValues();this.persist();}finally{this.applied=false;}
        this.publish({state:'ready',error:undefined,lastSynced:Date.now(),devices:remote.devices});return;
      }
      throw Error('Other devices are syncing. Your changes are saved and will retry shortly.');
    }catch(error){if(this.status.identity===identity)this.publish({state:[401,404].includes((error as {status?:number}).status??0)?'revoked':'offline',error:error instanceof Error?error.message:'Sync is offline. Changes stay saved on this device.'});}
    finally{this.running=false;if(this.dirty){this.dirty=false;this.changed();}}
  }
  async invitation(){
    const identity=this.status.identity;if(!identity)throw Error('Enable sync first.');
    const info=await syncRequest<{appUrl:string}>(identity.server,'info');
    const invite=await syncRequest<{invite:string;expires:number}>(identity.server,'spaces/'+identity.spaceId+'/invites',{method:'POST',token:identity.deviceToken,body:{}});
    const fragment=encode(new TextEncoder().encode(JSON.stringify({v:1,server:identity.server,spaceId:identity.spaceId,key:identity.key,invite:invite.invite})));
    const destination=serviceUrl(info.appUrl||identity.server);if(destination!==identity.server)throw Error('The sync service pairing address must use the same HTTPS origin.');
    const url=new URL(destination);url.hash='sync-link='+fragment;return {url:url.href,expires:invite.expires};
  }
  async join(link:string,name:string){
    let fragment:string|null=null;try{fragment=new URLSearchParams(new URL(link.trim()).hash.slice(1)).get('sync-link');}catch{/* Reported below. */}if(!fragment)throw Error('Paste a Hasimio pairing link.');
    const input=payload(fragment,'Invalid pairing link.'),identity={server:String(input.server),spaceId:String(input.spaceId),key:String(input.key),deviceId:randomDeviceId(),deviceToken:randomKey(),name};
    if(input.v!==1||typeof input.invite!=='string'||!validIdentity(identity))throw Error('Invalid pairing link.');
    const result=await syncRequest<{spaceId:string}>(identity.server,'invites/redeem',{method:'POST',body:{invite:input.invite,deviceId:identity.deviceId,deviceToken:identity.deviceToken,name}});
    if(result.spaceId!==identity.spaceId)throw Error('Pairing link does not match this sync space.');this.setIdentity(identity,true);await this.sync();
  }
  recoveryCode(){const identity=this.status.identity;if(!identity?.recoveryToken)return '';return 'hasimio1.'+encode(new TextEncoder().encode(JSON.stringify({server:identity.server,spaceId:identity.spaceId,key:identity.key,recoveryToken:identity.recoveryToken})));}
  async recover(code:string,name:string){
    if(!code.trim().startsWith('hasimio1.'))throw Error('Enter a Hasimio recovery code.');const input=payload(code.trim().slice(9),'Invalid recovery code.');
    const identity={server:String(input.server),spaceId:String(input.spaceId),key:String(input.key),recoveryToken:String(input.recoveryToken),deviceId:randomDeviceId(),deviceToken:randomKey(),name};
    if(!validIdentity(identity))throw Error('Invalid recovery code.');
    await syncRequest(identity.server,'recover',{method:'POST',body:{spaceId:identity.spaceId,recoveryToken:identity.recoveryToken,deviceId:identity.deviceId,deviceToken:identity.deviceToken,name}});this.setIdentity(identity,true);await this.sync();
  }
  async requestPairing(server:string,name:string){
    server=serviceUrl(server);const deviceId=randomDeviceId(),keys=await pairingKey();
    const request=await syncRequest<{code:string;pollToken:string;expires:number}>(server,'pairings',{method:'POST',body:{deviceId,name,publicKey:keys.publicKey}});
    return {...request,server,name,deviceId,privateKey:keys.privateKey,fingerprint:await pairingFingerprint(keys.publicKey),cancelled:false,approved:undefined as {identity:Identity;fingerprint:string}|undefined};
  }
  // Returns the approving device's security check. The relay could approve with
  // its own key, so the identity is applied only after the user confirms it.
  async pollPairing(request:Awaited<ReturnType<DeviceSync['requestPairing']>>,isActive=()=>!request.cancelled){
    const result=await syncRequest<{status:string;bundle?:Sealed;publicKey?:JsonWebKey}>(request.server,'pairings/'+request.code,{token:request.pollToken});if(!isActive()||result.status!=='approved')return false;
    const key=await sharedKey(request.privateKey,result.publicKey!),identity=await unseal<Identity>(result.bundle!,key,'Hasimio pairing v1');
    if(!isActive())return false;if(!validIdentity(identity)||identity.server!==request.server||identity.deviceId!==request.deviceId)throw Error('Pairing information does not match this device.');
    request.approved={identity,fingerprint:await pairingFingerprint(result.publicKey!)};return request.approved.fingerprint;
  }
  async finishPairing(request:Awaited<ReturnType<DeviceSync['requestPairing']>>){if(!request.approved)throw Error('Wait for your other device to approve this code.');this.setIdentity(request.approved.identity,true);await this.sync();}
  async previewPairing(code:string){const i=this.status.identity;if(!i)throw Error('Enable sync first.');const preview=await syncRequest<{deviceId:string;name:string;publicKey:JsonWebKey;expires:number}>(i.server,'spaces/'+i.spaceId+'/pairings/'+code,{token:i.deviceToken});return {...preview,fingerprint:await pairingFingerprint(preview.publicKey)};}
  async approvePairing(code:string,preview:Awaited<ReturnType<DeviceSync['previewPairing']>>){
    const i=this.status.identity;if(!i)throw Error('Enable sync first.');const keys=await pairingKey(),key=await sharedKey(keys.privateKey,preview.publicKey),deviceToken=randomKey();
    const bundle=await seal({server:i.server,spaceId:i.spaceId,key:i.key,deviceId:preview.deviceId,deviceToken,name:preview.name},key,'Hasimio pairing v1');
    await syncRequest(i.server,'spaces/'+i.spaceId+'/pairings/'+code,{method:'POST',token:i.deviceToken,body:{deviceToken,bundle,publicKey:keys.publicKey}});await this.sync();
    return pairingFingerprint(keys.publicKey);
  }
  async unlink(deviceId:string){const i=this.status.identity;if(!i)return;await syncRequest(i.server,'spaces/'+i.spaceId+'/devices/'+deviceId,{method:'DELETE',token:i.deviceToken});if(deviceId===i.deviceId)this.forget();else await this.sync();}
  forget(){localStorage.removeItem(identityKey);localStorage.removeItem(documentKey);this.document=emptyDocument();this.observed={};this.publish({identity:undefined,state:'off',devices:[],error:undefined,lastSynced:undefined});}
}
export const deviceSync=new DeviceSync();
export function useDeviceSync(){return useSyncExternalStore(deviceSync.subscribe,deviceSync.snapshot);}
