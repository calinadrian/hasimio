import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createHlsOutput} from './hls-output.mjs';

const name=index=>'segment-'+String(index).padStart(6,'0')+'.m4s';
const manifest=(count,end=false)=>'#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-MAP:URI="init.mp4"\n'
  +Array.from({length:count},(_,index)=>'#EXTINF:4,\n'+name(index)+'\n').join('')+(end?'#EXT-X-ENDLIST\n':'');
async function fixture(run,limit){
  const errors=[];
  const output=await createHlsOutput(()=>{},error=>errors.push(error),{limit});
  const server=createServer((req,res)=>output.serve(req,res,req.url.slice(1).split('?')[0],'test'));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port+'/';
  const get=(name,options)=>fetch(url+name,options);
  const put=async(name,body)=>{
    const response=await fetch(output.url+name,{method:'PUT',body});
    expect(response.status).toBe(200);await response.arrayBuffer();
  };
  try{await put('init.mp4',Buffer.from('test-init'));await run({output,get,put});expect(errors).toEqual([]);}
  finally{output.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

describe('memory HLS playback',()=>{
  it('holds FFmpeg at a paused window, permits ranged retries, and finishes a late final segment',async()=>{
    await fixture(async({output,get,put})=>{
      const media=Buffer.from('ABCDEFGHIJ');
      for(let i=0;i<6;i++)await put(name(i),media);
      await put('main.m3u8',manifest(6));
      let advanced=false;
      const next=put(name(6),media).then(()=>{advanced=true;});
      await put('main.m3u8',manifest(7,true));
      output.writerExited();
      expect(await (await get('main.m3u8')).text()).not.toContain(name(6));
      expect((await get(name(0),{method:'HEAD'})).headers.get('content-length')).toBe('10');
      const part=await get(name(0),{headers:{Range:'bytes=1-3'}});
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe('bytes 1-3/10');
      expect(await part.text()).toBe('BCD');
      await delay(50);
      expect(advanced).toBe(false);
      expect(await (await get(name(0))).text()).toBe('ABCDEFGHIJ');
      await next;await output.finished;
      const list=await (await get('main.m3u8')).text();
      expect(list).toContain(name(6)+'?job=test');
      expect(list).toContain('#EXT-X-ENDLIST');
    });
  });
  it('enforces the byte budget before the segment-count window fills and moves the playlist with eviction',async()=>{
    await fixture(async({get,put})=>{
      const media=Buffer.alloc(700*1024,7);
      await put(name(0),media);await put(name(1),media);await put('main.m3u8',manifest(2));
      let accepted=false;
      const next=put(name(2),media).then(()=>{accepted=true;});
      await delay(50);
      expect(accepted).toBe(false);
      for(const index of [0,1])expect((await (await get(name(index))).arrayBuffer()).byteLength).toBe(media.length);
      await next;await put('main.m3u8',manifest(3));
      const list=await (await get('main.m3u8')).text();
      expect(list).toContain('#EXT-X-MEDIA-SEQUENCE:1');
      expect(list).not.toContain(name(0));
      expect(list).toContain(name(2));
      expect((await get(name(0))).status).toBe(404);
      expect((await get(name(2),{headers:{Range:'bytes=9999999-'}})).status).toBe(416);
    },2*1024*1024);
  });
});
