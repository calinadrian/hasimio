import {gzipSync,Gunzip} from 'fflate';

const limit=16*1024*1024;
const compressed=(value:Uint8Array)=>value[0]===31&&value[1]===139;
export function jsonBytes(value:unknown,threshold=600000){
  const data=new TextEncoder().encode(JSON.stringify(value));
  if(data.length>limit)throw Error('This history exceeds the supported data size. Your existing saved data has been kept.');
  if(data.length<threshold)return data;
  const packed=gzipSync(data,{level:6});return packed.length<data.length?packed:data;
}
export function readJsonBytes<T>(input:Uint8Array):T{
  if(input.length>limit)throw Error('Saved data exceeds the supported size.');
  let data=input;
  if(compressed(input)){
    const parts:Uint8Array[]=[];let size=0;
    // Feed small chunks so a hostile compressed payload cannot request an
    // unbounded output allocation before its size is checked.
    const stream=new Gunzip(chunk=>{size+=chunk.length;if(size>limit)throw Error('Expanded data exceeds the supported size.');parts.push(chunk.slice());});
    for(let offset=0;offset<input.length;offset+=1024)stream.push(input.subarray(offset,offset+1024),offset+1024>=input.length);
    data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
  }
  return JSON.parse(new TextDecoder().decode(data)) as T;
}
export function storedJson(value:unknown){
  const data=jsonBytes(value,8192);if(!compressed(data))return new TextDecoder().decode(data);
  let text='';for(let offset=0;offset<data.length;offset+=8192)text+=String.fromCharCode(...data.subarray(offset,offset+8192));
  return 'gz1:'+btoa(text);
}
export function readStoredJson<T>(text:string):T{
  if(!text.startsWith('gz1:'))return JSON.parse(text) as T;
  if(text.length>limit)throw Error('Saved data exceeds the supported size.');
  return readJsonBytes<T>(Uint8Array.from(atob(text.slice(4)),value=>value.charCodeAt(0)));
}
