import {type Stream,safeHttp} from './media';
import {playerSettings,type PlayerSettings,type PreferredQuality} from './preferences';
import {detectQuality,detectCodec,detectRelease,parseSize,QUALITY_ORDER,type Quality} from '../shared/stream-info.mjs';
import {languageMatch,preferredTrack,verifiedTracks} from './playback-tracks';
export type StreamOption={stream:Stream;quality:Quality;provider:string;release?:string;codec?:string;seeders?:number;sizeBytes?:number;filename:string;detail:string};
export function describeStream(stream:Stream):StreamOption {
  const text=`${stream.name ?? ''}\n${stream.title ?? ''}\n${stream.filename ?? ''}`;
  const originalDetail=stream.title || stream.name || 'No further details supplied.';
  const detail=stream.filename&&!originalDetail.includes(stream.filename)?`${stream.filename}\n${originalDetail}`:originalDetail;
  const parsedSeeders=text.match(/([\d,]+)\s+seeders\b/i)?.[1];
  const sizeBytes=stream.sizeBytes ?? parseSize(stream.title,text);
  return {stream,quality:QUALITY_ORDER.includes(stream.quality as Quality)?stream.quality as Quality:detectQuality(text),provider:stream.provider || stream.name?.replace(/\s*[·|]\s*(720p|1080p|2k|4k|torrent)\s*$/i,'') || 'Video source',release:detectRelease(text),codec:stream.codec || detectCodec(text),seeders:stream.seeders ?? (parsedSeeders ? Number(parsedSeeders.replaceAll(',','')) : undefined),sizeBytes,filename:stream.filename || stream.title?.split('\n')[0] || stream.name || 'Source details',detail};
}
export function availableQualities(options:StreamOption[]) {return QUALITY_ORDER.filter(q=>options.some(o=>o.quality===q));}
export function defaultQuality(qualities:Quality[],preferred:PreferredQuality='Auto'):Quality {
  if(preferred==='Auto')return qualities.includes('1080p')?'1080p':qualities.includes('720p')?'720p':qualities[0]??'Other';
  if(qualities.includes(preferred))return preferred;
  const pixels:Record<Quality,number>={'SD':480,'720p':720,'1080p':1080,'2K':1440,'4K':2160,'Other':0};
  const lower=qualities.filter(quality=>pixels[quality]>0&&pixels[quality]<pixels[preferred]).sort((a,b)=>pixels[b]-pixels[a]);
  const higher=qualities.filter(quality=>pixels[quality]>pixels[preferred]).sort((a,b)=>pixels[a]-pixels[b]);
  return lower[0]??higher[0]??qualities[0]??'Other';
}
export function formatSize(bytes?:number) {if(bytes==null||!Number.isFinite(bytes)||bytes<0)return 'Size unknown';return bytes>=1024**3?`${(bytes/1024**3).toFixed(1)} GB`:`${Math.round(bytes/1024**2)} MB`;}
export function sortSources(options:StreamOption[],sort:string) {return [...options].sort((a,b)=>sort==='size'?(a.sizeBytes??Infinity)-(b.sizeBytes??Infinity):(b.seeders??-1)-(a.seeders??-1));}
export type SourcePreferences=Pick<PlayerSettings,'audioLanguage'|'subtitleLanguage'|'autoSubtitles'|'preferredQuality'>;
export function sourceLanguageMatches(stream:Stream,videoId:string,preferences:SourcePreferences){
  const tracks=verifiedTracks(stream,videoId);
  const audio=preferredTrack(tracks?.audio??[],preferences.audioLanguage);
  const subtitles=preferences.autoSubtitles
    ? preferredTrack([...(tracks?.subtitles.filter(track=>track.supported)??[]),...(stream.subtitleTrack?[stream.subtitleTrack]:[])],preferences.subtitleLanguage)
    : undefined;
  return {audio:audio?languageMatch(audio.language,preferences.audioLanguage):0,subtitles:subtitles?languageMatch(subtitles.language,preferences.subtitleLanguage):0};
}
export function usableSource(stream:Stream){
  // A debrid file the service does not hold yet would first have to download there.
  if(stream.debrid==='uncached')return false;
  return stream.infoHash?(describeStream(stream).seeders??1)>0:!!safeHttp(stream.url);
}
function qualityOrder(options:StreamOption[],preferred:PreferredQuality){
  const remaining=availableQualities(options),ordered:Quality[]=[];
  while(remaining.length){
    const quality=defaultQuality(remaining,preferred);
    ordered.push(quality);
    remaining.splice(remaining.indexOf(quality),1);
  }
  return ordered;
}
export function rankSources(streams:Stream[],preferences:SourcePreferences,videoId:string){
  const options=streams.filter(stream=>stream.infoHash||safeHttp(stream.url)).map(describeStream);
  const quality=qualityOrder(options,preferences.preferredQuality);
  return options.map(option=>({option,usable:usableSource(option.stream),matches:sourceLanguageMatches(option.stream,videoId,preferences)}))
    // Files a debrid service already holds start at once, with no peers to find.
    .sort((a,b)=>Number(b.usable)-Number(a.usable)||Number(b.option.stream.debrid==='cached')-Number(a.option.stream.debrid==='cached')||b.matches.audio-a.matches.audio||b.matches.subtitles-a.matches.subtitles||
      quality.indexOf(a.option.quality)-quality.indexOf(b.option.quality)||(b.option.seeders??-1)-(a.option.seeders??-1))
    .map(({option})=>option.stream);
}
export function bestSource(streams:Stream[],preferences:SourcePreferences=playerSettings(),videoId=''){
  return rankSources(streams,preferences,videoId)[0];
}
