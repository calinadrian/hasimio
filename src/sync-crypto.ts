export type Sealed={v:1;iv:string;data:string};
export function encode(bytes:Uint8Array){let text='';for(let offset=0;offset<bytes.length;offset+=8192)text+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function decode(text:string){if(!/^[A-Za-z0-9_-]+$/.test(text))throw Error('Invalid sync key.');return Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export function randomKey(){return encode(crypto.getRandomValues(new Uint8Array(32)));}
export function randomDeviceId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function seal(value:unknown,key:string,context='Hasimio sync v1'):Promise<Sealed>{
  const raw=decode(key);if(raw.length!==32)throw Error('Invalid sync key.');
  const aes=await crypto.subtle.importKey('raw',raw.buffer,'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},aes,new TextEncoder().encode(JSON.stringify(value)));
  return {v:1,iv:encode(iv),data:encode(new Uint8Array(data))};
}
export async function unseal<T>(value:Sealed,key:string,context='Hasimio sync v1'):Promise<T>{
  try{
    if(value?.v!==1)throw Error();const raw=decode(key);if(raw.length!==32)throw Error();
    const aes=await crypto.subtle.importKey('raw',raw.buffer,'AES-GCM',false,['decrypt']);
    const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv).buffer,additionalData:new TextEncoder().encode(context)},aes,decode(value.data).buffer);
    return JSON.parse(new TextDecoder().decode(data));
  }catch{throw Error('The sync data could not be decrypted. Check your recovery code or pair this device again.');}
}
export async function pairingKey(){const keys=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);return {privateKey:keys.privateKey,publicKey:await crypto.subtle.exportKey('jwk',keys.publicKey)};}
export async function sharedKey(privateKey:CryptoKey,publicKey:JsonWebKey){
  const peer=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const key=await crypto.subtle.deriveKey({name:'ECDH',public:peer},privateKey,{name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  return encode(new Uint8Array(await crypto.subtle.exportKey('raw',key)));
}
// Both screens show this so a relay cannot substitute its own pairing key.
// 40 bits keeps brute-forcing a matching key impractical within the code lifetime.
export async function pairingFingerprint(publicKey:JsonWebKey){
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('Hasimio pairing v1|'+publicKey.x+'|'+publicKey.y)));
  let bits=0n;for(const byte of digest.subarray(0,5))bits=bits<<8n|BigInt(byte);
  const text=Array.from({length:8},(_,i)=>'0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Number(bits>>BigInt(35-i*5)&31n)]).join('');
  return text.slice(0,4)+'-'+text.slice(4);
}
export function serviceUrl(input:string){
  const url=new URL(input.trim());
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw Error('Enter the HTTPS address of your sync service. Localhost HTTP is allowed for testing.');
  return url.origin;
}
