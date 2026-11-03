import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createExtractorFromData} from 'node-unrar-js';
const require=createRequire(import.meta.url);
let wasm;

export async function readRarSubtitles(bytes){
  wasm??=readFile(require.resolve('node-unrar-js/dist/js/unrar.wasm'));
  const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const extractor=await createExtractorFromData({data,wasmBinary:await wasm});
  const listing=extractor.getFileList(),headers=[...listing.fileHeaders];
  if(headers.length>1000)throw Error('Subtitle archive has too many entries.');
  let total=0;
  const selected=headers.filter(header=>!header.flags.directory&&!header.flags.encrypted&&/\.(srt|vtt)$/i.test(header.name));
  for(const header of selected){total+=header.unpSize;if(header.unpSize>5*1024*1024||total>20*1024*1024)throw Error('Subtitle archive is too large.');}
  if(!selected.length)return [];
  // Drain the library's lazy iterator so its native allocations are released.
  return [...extractor.extract({files:selected.map(header=>header.name)}).files].filter(file=>file.extraction).map(file=>({name:file.fileHeader.name,data:file.extraction}));
}
