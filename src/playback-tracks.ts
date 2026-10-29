import type {Stream} from './media';

export type MediaTrack={index:number;language:string;title?:string;codec:string;default:boolean;supported?:boolean};
export function defaultAudioTrack(tracks?:MediaTrack[]){return tracks?.find(track=>track.default)?.index??tracks?.[0]?.index??0;}
// Compatible audio waits for the track list so it converts the file's default dub, not
// track 0. A failed track check still starts conversion rather than blocking playback.
export type AudioAction={action:'wait'|'start'|'stop'}|{action:'fail';message:string};
export function audioAction({ready,compatible,audioTracks,tracksError}:{ready:boolean;compatible:boolean;audioTracks?:MediaTrack[];tracksError?:string}):AudioAction{
  if(!ready)return {action:'wait'};
  if(!compatible)return {action:'stop'};
  if(audioTracks===undefined&&!tracksError)return {action:'wait'};
  if(audioTracks?.length===0)return {action:'fail',message:'This file contains no embedded audio tracks. Choose another source.'};
  return {action:'start'};
}
const codes:Record<string,string>={eng:'en',jpn:'ja',spa:'es',fre:'fr',fra:'fr',ger:'de',deu:'de',ita:'it',por:'pt',rum:'ro',ron:'ro',chi:'zh',zho:'zh',kor:'ko',rus:'ru',hin:'hi',ara:'ar'};
export function trackLabel(track:MediaTrack,kind='Audio'){
  let language=`${kind} track ${track.index+1}`;
  if(track.language!=='und'){try{language=new Intl.DisplayNames(['en'],{type:'language'}).of(codes[track.language]||track.language)||language;}catch{language=track.language;}}
  return `${language}${track.title&&track.title.toLowerCase()!==language.toLowerCase()?' · '+track.title:''} · ${track.codec}${track.default?' · Default':''}${track.supported===false?' · Image format (unsupported)':''}`;
}
export type TrackSummary={audio:number;subtitles:number;audioLanguages:string[];subtitleLanguages:string[]};
const key='hasimio:verified-tracks';const memoryCache:Record<string,TrackSummary>={};
function cache():Record<string,TrackSummary>{try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?{...value,...memoryCache}:{...memoryCache};}catch{return {...memoryCache};}}
export function saveTrackSummary(hash:string,videoId:string,audio:MediaTrack[],subtitles:MediaTrack[]){
  const id=`${hash}:${videoId}`;memoryCache[id]={audio:audio.length,subtitles:subtitles.length,audioLanguages:audio.map(t=>trackLabel(t)),subtitleLanguages:subtitles.map(t=>trackLabel(t,'Subtitle'))};if(Object.keys(memoryCache).length>100)delete memoryCache[Object.keys(memoryCache)[0]];
  try{const entries=Object.entries(cache()).filter(([id])=>id!==`${hash}:${videoId}`).slice(-99);entries.push([`${hash}:${videoId}`,{audio:audio.length,subtitles:subtitles.length,audioLanguages:audio.map(t=>trackLabel(t)),subtitleLanguages:subtitles.map(t=>trackLabel(t,'Subtitle'))}]);localStorage.setItem(key,JSON.stringify(Object.fromEntries(entries)));}catch{/* Playback works without persistent storage. */}
}
function languageNames(labels:string[]){return [...new Set(labels.map(label=>label.split(' · ')[0]).map(name=>/^(?:Audio|Subtitle) track \d+$/.test(name)?'Unspecified':name))];}
export function sourceTrackInfo(stream:Stream,videoId:string){
  const verified=stream.infoHash?cache()[`${stream.infoHash}:${videoId}`]:undefined;
  if(verified)return {audioNames:languageNames(verified.audioLanguages),subtitleNames:languageNames(verified.subtitleLanguages),audioCount:verified.audio,subtitleCount:verified.subtitles,audio:`${verified.audio} audio / dub ${verified.audio===1?'track':'tracks'}`,subtitles:`${verified.subtitles} subtitle ${verified.subtitles===1?'track':'tracks'}`,verified:true,detail:[...verified.audioLanguages,...verified.subtitleLanguages].join('\n')};
  const text=`${stream.filename||''} ${stream.title||''}`.replaceAll('_','.');
  const multiAudio=/\b(?:dual[ ._-]*audio|multi[ ._-]*(?:audio|dub)|dual[ ._-]*dub)\b/i.test(text);
  const multiSubs=/\b(?:multi[ ._-]*(?:sub|subs|subtitles))\b/i.test(text);
  const subs=multiSubs||/\b(?:e[ ._-]*sub|eng[ ._-]*subs?|english[ ._-]*subs?|soft[ ._-]*subs?|hard[ ._-]*subs?|subbed)\b/i.test(text);
  return {audioNames:[] as string[],subtitleNames:[] as string[],audioCount:0,subtitleCount:0,audio:multiAudio?'Multiple dubs · release tag':'Audio check pending',subtitles:multiSubs?'Multiple subs · release tag':subs?'Subtitles · release tag':'Subtitle check pending',verified:false,detail:'Release tags are unverified. Exact tracks are checked automatically before playback.'};
}
export function srtToVtt(text:string){return `WEBVTT\n\n${text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2')}`;}
function timestamp(value:string){const parts=value.split(':').map(Number);if(parts.length<2||parts.length>3||parts.some(n=>!Number.isFinite(n)||n<0))return NaN;return parts.reduce((total,n)=>total*60+n,0);}
export function parseVtt(text:string){
  const blocks=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split(/\n[ \t]*\n/);
  // FFmpeg flushes each complete cue with a newline; the blank separator arrives with the next cue.
  // Waiting for two newlines makes the newest subtitle appear one cue late.
  if(!text.endsWith('\n'))blocks.pop();
  return blocks.flatMap(block=>{if(/^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(block))return [];const lines=block.trimEnd().split('\n'),line=lines.findIndex(l=>l.includes('-->'));if(line<0)return [];const timing=lines[line].match(/^(\S+)\s+-->\s+(\S+)/);if(!timing)return [];const start=timestamp(timing[1]),end=timestamp(timing[2]),content=lines.slice(line+1).join('\n');return Number.isFinite(start)&&Number.isFinite(end)&&end>start&&content?[{start,end,text:content}]:[];});
}
