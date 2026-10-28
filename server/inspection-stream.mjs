import {Readable} from 'node:stream';
import {INSPECTION_READ_WINDOW} from '../shared/inspection-policy.mjs';

// FFmpeg may request an open-ended HTTP range. Select small torrent windows as
// it reads, rather than scheduling the entire movie before headers are checked.
export function inspectionStream(file,{start,end},window=INSPECTION_READ_WINDOW){
  let active,closed=false;
  const stream=Readable.from((async function*(){
    try{
      for(let offset=start;offset<=end&&!closed;offset+=window){
        active=file.createReadStream({start:offset,end:Math.min(end,offset+window-1)});
        for await(const chunk of active){if(closed)return;yield chunk;}
        active=undefined;
      }
    }catch(error){if(!closed)throw error;}finally{active?.destroy();}
  })(),{objectMode:false,highWaterMark:16*1024});
  // Readable.from waits for a pending iterator read before emitting close, so
  // cancel the inner torrent read as soon as destruction is requested.
  const destroy=stream.destroy.bind(stream);
  stream.destroy=error=>{closed=true;active?.destroy();return destroy(error);};
  return stream;
}
