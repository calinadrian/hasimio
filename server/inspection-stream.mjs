import {Readable} from 'node:stream';
import {INSPECTION_READ_WINDOW} from '../shared/inspection-policy.mjs';

// FFmpeg may request an open-ended HTTP range. Select small torrent windows as
// it reads, rather than scheduling the entire movie before headers are checked.
// With `ahead`, the following window starts downloading while the current one is read, so a fast reader
// does not wait at every boundary. At most two windows are ever selected. `pin(first,last)` is told which
// bytes of the file a window covers and returns a function to call when the window is finished with.
export function inspectionStream(file,{start,end},window=INSPECTION_READ_WINDOW,ahead=false,pin){
  let active,next,closed=false;
  const open=offset=>{const last=Math.min(end,offset+window-1),release=pin?.(offset,last),stream=file.createReadStream({start:offset,end:last});if(release)stream.once('close',release);return stream;};
  const stream=Readable.from((async function*(){
    try{
      for(let offset=start;offset<=end&&!closed;offset+=window){
        active=next??open(offset);next=ahead&&offset+window<=end?open(offset+window):undefined;
        for await(const chunk of active){if(closed)return;yield chunk;}
        active=undefined;
      }
    }catch(error){if(!closed)throw error;}finally{active?.destroy();next?.destroy();}
  })(),{objectMode:false,highWaterMark:16*1024});
  // Readable.from waits for a pending iterator read before emitting close, so
  // cancel the inner torrent read as soon as destruction is requested.
  const destroy=stream.destroy.bind(stream);
  stream.destroy=error=>{closed=true;active?.destroy();next?.destroy();return destroy(error);};
  return stream;
}
