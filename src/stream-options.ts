import {type Stream} from './media';
import {detectQuality,detectCodec,detectRelease,QUALITY_ORDER,type Quality} from '../shared/stream-info.mjs';
export type StreamOption={stream:Stream;quality:Quality;provider:string;release?:string;codec?:string;seeders?:number;sizeBytes?:number;filename:string;detail:string};
export function describeStream(stream:Stream):StreamOption {
  const text=`${stream.name ?? ''}\n${stream.title ?? ''}\n${stream.filename ?? ''}`;
  const originalDetail=stream.title || stream.name || 'No further details supplied.';
  const detail=stream.filename&&!originalDetail.includes(stream.filename)?`${stream.filename}\n${originalDetail}`:originalDetail;
  const parsedSeeders=text.match(/([\d,]+)\s+seeders\b/i)?.[1];
  const parsedSize=text.match(/([\d.]+)\s*(GB|MB|TB)\b/i);
  const sizeUnits:Record<string,number>={MB:2,GB:3,TB:4};
  const sizeBytes=stream.sizeBytes ?? (parsedSize ? Number(parsedSize[1])*1024**(sizeUnits[parsedSize[2].toUpperCase()] ?? 0) : undefined);
  return {stream,quality:QUALITY_ORDER.includes(stream.quality as Quality)?stream.quality as Quality:detectQuality(text),provider:stream.provider || stream.name?.replace(/\s*[·|]\s*(720p|1080p|2k|4k|torrent)\s*$/i,'') || 'Video source',release:detectRelease(text),codec:stream.codec || detectCodec(text),seeders:stream.seeders ?? (parsedSeeders ? Number(parsedSeeders.replaceAll(',','')) : undefined),sizeBytes,filename:stream.filename || stream.title?.split('\n')[0] || stream.name || 'Source details',detail};
}
export function availableQualities(options:StreamOption[]) {return QUALITY_ORDER.filter(q=>options.some(o=>o.quality===q));}
export function defaultQuality(qualities:Quality[]):Quality {return qualities.includes('1080p')?'1080p':qualities.includes('720p')?'720p':qualities[0] ?? 'Other';}
export function formatSize(bytes?:number) {if(bytes==null||!Number.isFinite(bytes)||bytes<0)return 'Size unknown';return bytes>=1024**3?`${(bytes/1024**3).toFixed(1)} GB`:`${Math.round(bytes/1024**2)} MB`;}
export function sortSources(options:StreamOption[],sort:string) {return [...options].sort((a,b)=>sort==='size'?(a.sizeBytes??Infinity)-(b.sizeBytes??Infinity):(b.seeders??-1)-(a.seeders??-1));}
