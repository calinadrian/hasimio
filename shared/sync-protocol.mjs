// Request validation shared by the self-hosted and hosted sync relays, so a
// space can move between them. scripts/prepare-hosted-sync.mjs copies this
// file into sites/hasimio-sync/lib; edit it here only.
export const ID=/^[a-f\d]{32}$/,TOKEN=/^[A-Za-z0-9_-]{43}$/;
// D1 rows are limited to about 1 MB, so both relays accept the same ciphertext size.
export const MAX_DATA=900000,MAX_BODY=1000000;
export const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function envelope(value){
  if(typeof value?.data==='string'&&value.data.length>MAX_DATA)fail(413,'Your encrypted sync data exceeds this service’s storage limit.');
  if(value?.v!==1||typeof value.iv!=='string'||!/^[A-Za-z0-9_-]{16}$/.test(value.iv)||typeof value.data!=='string'||value.data.length<22||!/^[A-Za-z0-9_-]+$/.test(value.data))fail(400,'Invalid encrypted data.');
  return {v:1,iv:value.iv,data:value.data};
}
export function publicKey(value){
  if(value?.kty!=='EC'||value.crv!=='P-256'||!TOKEN.test(value.x)||!TOKEN.test(value.y))fail(400,'Invalid pairing encryption.');
  return {kty:'EC',crv:'P-256',x:value.x,y:value.y};
}
const deviceName=value=>typeof value.name==='string'&&!!value.name.trim()&&value.name.length<=80;
export function deviceInput(value){
  if(!ID.test(value.deviceId)||!deviceName(value)||typeof value.deviceToken!=='string'||!TOKEN.test(value.deviceToken))fail(400,'Invalid device details.');
  return {...value,name:value.name.trim()};
}
export function pairingInput(value){
  if(!ID.test(value.deviceId)||!deviceName(value))fail(400,'Invalid pairing request.');
  return {deviceId:value.deviceId,name:value.name.trim(),publicKey:publicKey(value.publicKey)};
}
