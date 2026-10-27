// Draws the Hasimio mark (the sidebar's play symbol) as resources/icon.png and public/favicon.png.
// electron-builder turns the 512 px PNG into the Windows .ico.
import {mkdir,writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const BACKGROUND=[0xe0,0xe0,0xe0],SYMBOL=[0x20,0x20,0x20];

function crc32(bytes) {let c=~0;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return ~c>>>0;}
function chunk(type,data) {const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);out.write(type,4,'ascii');data.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,8+data.length)),8+data.length);return out;}
export function png(size,pixel) {
  const raw=Buffer.alloc(size*(size*4+1));
  for(let y=0;y<size;y++){raw[y*(size*4+1)]=0;for(let x=0;x<size;x++)pixel(x,y).forEach((v,i)=>{raw[y*(size*4+1)+1+x*4+i]=v;});}
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
// Coverage of one sample point, in a 1x1 square: rounded square background, play triangle on top.
function sample(u,v) {
  const inset=0.03,radius=0.2,a=inset+radius,b=1-inset-radius;
  const dx=Math.max(a-u,0,u-b),dy=Math.max(a-v,0,v-b);
  if(u<inset||u>1-inset||v<inset||v>1-inset||dx*dx+dy*dy>radius*radius)return 'clear';
  // Lucide's play triangle (6,3 20,12 6,21 on a 24 grid) at the sidebar's proportions, nudged right to look centred.
  const s=0.62/24,ox=0.5-12*s+0.035,oy=0.5-12*s,x=(u-ox)/s,y=(v-oy)/s;
  const inside=x>=6&&(y-3)>=(x-6)*9/14&&(21-y)>=(x-6)*9/14;
  return inside?'symbol':'background';
}
export function icon(size,samples=4) {
  return png(size,(x,y)=>{
    let bg=0,sym=0;
    for(let i=0;i<samples;i++)for(let j=0;j<samples;j++){const hit=sample((x+(i+0.5)/samples)/size,(y+(j+0.5)/samples)/size);if(hit==='background')bg++;else if(hit==='symbol')sym++;}
    const total=samples*samples,alpha=(bg+sym)/total;if(!alpha)return [0,0,0,0];
    const mix=sym/(bg+sym);
    return [...BACKGROUND.map((c,i)=>Math.round(c*(1-mix)+SYMBOL[i]*mix)),Math.round(alpha*255)];
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  for(const [file,size] of [['resources/icon.png',512],['public/favicon.png',64]]){await mkdir(path.join(root,path.dirname(file)),{recursive:true});await writeFile(path.join(root,file),icon(size));console.log(`Wrote ${file} (${size} px)`);}
}
