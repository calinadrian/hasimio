export type Profile={id:string;name:string;color:number;createdAt:number};
const registryKey='hasimio:profiles:v1';
export const profileLimit=8;
let active:Profile|undefined;
const validId=(value:unknown):value is string=>typeof value==='string'&&(value==='default'||/^[a-f\d]{32}$/.test(value));

export function profiles():Profile[]{
  const text=localStorage.getItem(registryKey);
  if(text===null){
    // The original profile keeps the existing keys in place: no copying large
    // sync documents, quota spikes, deletions or changes to its pairing identity.
    const initial=[{id:'default',name:'My profile',color:0,createdAt:Date.now()}];
    localStorage.setItem(registryKey,JSON.stringify(initial));return initial;
  }
  let value:unknown;
  try{value=JSON.parse(text);}catch{throw Error('The saved profile list could not be read. Your saved data has been kept.');}
  if(!Array.isArray(value)||!value.length||value.length>profileLimit||value.some(item=>!item||!validId(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>32||!Number.isInteger(item.color)||item.color<0||item.color>5||!Number.isFinite(item.createdAt))||new Set(value.map(item=>item.id)).size!==value.length)throw Error('The saved profile list could not be read. Your saved data has been kept.');
  return value;
}
function save(value:Profile[]){localStorage.setItem(registryKey,JSON.stringify(value));}
function nameFor(name:string,list:Profile[],except?:string){const value=name.trim();if(!value||value.length>32)throw Error('Enter a profile name with up to 32 characters.');if(list.some(profile=>profile.id!==except&&profile.name.toLowerCase()===value.toLowerCase()))throw Error('Choose a different profile name.');return value;}
export function createProfile(name:string,color:number){
  const list=profiles();if(list.length>=profileLimit)throw Error('You can have up to eight profiles on this device.');
  const profile={id:Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join(''),name:nameFor(name,list),color:Math.max(0,Math.min(5,Math.floor(color))),createdAt:Date.now()};
  save([...list,profile]);return profile;
}
export function renameProfile(id:string,name:string,color:number){const list=profiles();if(!list.some(profile=>profile.id===id))throw Error('This profile is no longer available.');save(list.map(profile=>profile.id===id?{...profile,name:nameFor(name,list,id),color:Math.max(0,Math.min(5,Math.floor(color)))}:profile));}
export function removeProfile(id:string){
  const list=profiles();if(list.length<=1)throw Error('Keep at least one profile.');if(active)throw Error('Open the profile picker before removing a profile.');
  if(!list.some(profile=>profile.id===id))throw Error('This profile is no longer available.');
  const prefix='hasimio:profile:'+id+':',keys:string[]=[];
  for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);if(key&&(id==='default'?key.startsWith('hasimio:')&&key!==registryKey&&!key.startsWith('hasimio:profile:'):key.startsWith(prefix)))keys.push(key);}
  for(const key of keys)localStorage.removeItem(key);
  save(list.filter(profile=>profile.id!==id));
}
export function currentProfile(){return active;}
// Switching profiles reloads the app. A lone profile opens directly, so the reload has to say
// when the picker was asked for; the address is the fallback where session storage is blocked.
const pickerKey='hasimio:profile-picker';
export function requestProfilePicker(){try{sessionStorage.setItem(pickerKey,'1');}catch{location.hash='profiles';}}
let pickerRequested:boolean|undefined;
export function profilePickerRequested(){
  if(pickerRequested!==undefined)return pickerRequested;
  pickerRequested=location.hash==='#profiles';
  if(pickerRequested)history.replaceState(null,'',location.pathname+location.search);
  try{if(sessionStorage.getItem(pickerKey)==='1'){pickerRequested=true;sessionStorage.removeItem(pickerKey);}}catch{/* The address fallback above still applies. */}
  return pickerRequested;
}
export function selectProfile(id:string){
  if(active&&active.id!==id)throw Error('Reopen the profile picker to switch profiles.');
  const profile=profiles().find(value=>value.id===id);if(!profile)throw Error('This profile is no longer available.');active=profile;
  window.addEventListener('storage',event=>{
    if(event.key!==registryKey&&event.key!==null)return;
    try{if(!profiles().some(value=>value.id===id))location.reload();}catch{location.reload();}
  });
}
export function storageKey(key:string){return !active||active.id==='default'?key:'hasimio:profile:'+active.id+':'+key.replace(/^hasimio:/,'');}
export function logicalStorageKey(key:string){return key.replace(/^hasimio:profile:[a-f\d]{32}:/,'hasimio:');}
export const profileStorage={
  getItem:(key:string)=>localStorage.getItem(storageKey(key)),
  setItem:(key:string,value:string)=>localStorage.setItem(storageKey(key),value),
  removeItem:(key:string)=>localStorage.removeItem(storageKey(key)),
};
