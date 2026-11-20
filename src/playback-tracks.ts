import {profileStorage} from './profile-storage';
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
const codes:Record<string,string>={eng:'en',jpn:'ja',spa:'es',spn:'es',fre:'fr',fra:'fr',ger:'de',deu:'de',ita:'it',por:'pt',pob:'pt-BR',rum:'ro',ron:'ro',chi:'zh',zho:'zh',zht:'zh-Hant',kor:'ko',rus:'ru',hin:'hi',ara:'ar',dut:'nl',nld:'nl',pol:'pl',tur:'tr',gre:'el',ell:'el',heb:'he',swe:'sv',dan:'da',fin:'fi',nor:'no',cze:'cs',ces:'cs',hun:'hu',bul:'bg',hrv:'hr',scc:'sr',srp:'sr',slv:'sl',slo:'sk',slk:'sk',ukr:'uk',vie:'vi',tha:'th',ind:'id',may:'ms',msa:'ms',per:'fa',fas:'fa',est:'et',lav:'lv',lit:'lt',ice:'is',isl:'is',alb:'sq',sqi:'sq',mac:'mk',mkd:'mk',bos:'bs',cat:'ca',baq:'eu',eus:'eu',glg:'gl',ben:'bn',tam:'ta',tel:'te',mal:'ml',urd:'ur',kur:'ku',geo:'ka',kat:'ka',arm:'hy',hye:'hy'};
export const subtitleLanguages=Object.keys(codes).filter((code,index,all)=>all.findIndex(other=>codes[other]===codes[code])===index);
function normalizedLanguage(value:string){
  const [base,...suffix]=value.trim().toLowerCase().replaceAll('_','-').split('-');
  const language=codes[base]?.toLowerCase()||base;
  return [language,...suffix].join('-');
}
export function languageMatch(a:string,b:string){
  const left=normalizedLanguage(a),right=normalizedLanguage(b);
  if(!left||!right||left==='und'||right==='und')return 0;
  return left===right?2:left.split('-')[0]===right.split('-')[0]&&(!left.includes('-')||!right.includes('-'))?1:0;
}
export function sameLanguage(a:string,b:string){return languageMatch(a,b)>0;}
export function preferredTrack<T extends {language?:string;default?:boolean}>(tracks:readonly T[],language:string){
  let best:T|undefined,score=0;
  for(const track of tracks){
    const match=languageMatch(track.language||'',language);
    if(match>score||(match>0&&match===score&&track.default&&!best?.default)){best=track;score=match;}
  }
  return best;
}
// Intl.DisplayNames arrived in Chrome 81; webOS 6 (Chrome 79) would otherwise
// show raw codes such as "rum" in the subtitle menus.
const fallbackNames:Record<string,string>={en:'English',ro:'Romanian',fr:'French',es:'Spanish',de:'German',it:'Italian',pt:'Portuguese','pt-br':'Portuguese (Brazil)',hu:'Hungarian',ru:'Russian',uk:'Ukrainian',bg:'Bulgarian',sr:'Serbian',hr:'Croatian',bs:'Bosnian',sl:'Slovenian',sk:'Slovak',cs:'Czech',pl:'Polish',el:'Greek',tr:'Turkish',nl:'Dutch',sv:'Swedish',da:'Danish',fi:'Finnish',no:'Norwegian',ar:'Arabic',he:'Hebrew',hi:'Hindi',ja:'Japanese',ko:'Korean',zh:'Chinese','zh-hant':'Chinese (Traditional)',vi:'Vietnamese',th:'Thai',id:'Indonesian',ms:'Malay',fa:'Persian',lv:'Latvian',lt:'Lithuanian',et:'Estonian',is:'Icelandic',sq:'Albanian',mk:'Macedonian',ca:'Catalan',eu:'Basque',gl:'Galician',bn:'Bengali',ta:'Tamil',te:'Telugu',ml:'Malayalam',ur:'Urdu',ku:'Kurdish',ka:'Georgian',hy:'Armenian'};
export function languageName(code:string){
  const normalized=normalizedLanguage(code);
  try{const name=new Intl.DisplayNames(['en'],{type:'language'}).of(normalized);if(name&&name.toLowerCase()!==normalized)return name;}catch{/* Older engines fall back below. */}
  return fallbackNames[normalized]||fallbackNames[normalized.split('-')[0]]||code;
}
export function trackLabel(track:MediaTrack,kind='Audio'){
  let language=`${kind} track ${track.index+1}`;
  if(track.language!=='und')language=languageName(track.language);
  return `${language}${track.title&&track.title.toLowerCase()!==language.toLowerCase()?' · '+track.title:''} · ${track.codec}${track.default?' · Default':''}${track.supported===false?' · Image format (unsupported)':''}`;
}
type TrackSummary={fileIndex?:number;audio:MediaTrack[];subtitles:MediaTrack[]};
const key='hasimio:verified-tracks:v2';
let memoryCache:Record<string,TrackSummary>|undefined;
const listeners=new Set<()=>void>();
let revision=0;
export const trackRevision=()=>revision;
export function subscribeTrackChanges(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function cache(){
  if(!memoryCache){
    try{
      const saved=JSON.parse(profileStorage.getItem(key)||'{}') as Record<string,TrackSummary>|null;
      memoryCache=Object.fromEntries(Object.entries(saved??{}).filter(([,entry])=>Array.isArray(entry?.audio)&&Array.isArray(entry?.subtitles)));
    }
    catch{memoryCache={};}
  }
  return memoryCache??(memoryCache={});
}
export function trackSourceKey(stream:Stream,videoId:string){
  return JSON.stringify([stream.infoHash?.toLowerCase(),videoId,stream.fileIdx??null]);
}
export function verifiedTracks(stream:Stream,videoId:string){
  return stream.infoHash?cache()[trackSourceKey(stream,videoId)]:undefined;
}
export function saveTrackSummary(hash:string,videoId:string,audio:MediaTrack[],subtitles:MediaTrack[],requestedFile?:number,actualFile?:number){
  const cacheKey=trackSourceKey({infoHash:hash,fileIdx:requestedFile},videoId);
  const summary={fileIndex:actualFile,audio,subtitles};
  const entries=cache();
  if(JSON.stringify(entries[cacheKey])===JSON.stringify(summary))return;
  delete entries[cacheKey];
  entries[cacheKey]=summary;
  if(Object.keys(entries).length>100)delete entries[Object.keys(entries)[0]];
  try{profileStorage.setItem(key,JSON.stringify(entries));}catch{/* Playback works without persistent storage. */}
  revision++;
  for(const listener of listeners)listener();
}
function languageNames(labels:string[]){return [...new Set(labels.map(label=>label.split(' · ')[0]).map(name=>/^(?:Audio|Subtitle) track \d+$/.test(name)?'Unspecified':name))];}
export function sourceTrackInfo(stream:Stream,videoId:string){
  const verified=verifiedTracks(stream,videoId);
  if(verified){
    const audio=verified.audio.map(track=>trackLabel(track));
    const subtitles=verified.subtitles.map(track=>trackLabel(track,'Subtitle'));
    return {audioNames:languageNames(audio),subtitleNames:languageNames(subtitles),audioCount:audio.length,subtitleCount:subtitles.length,audio:`${audio.length} audio / dub ${audio.length===1?'track':'tracks'}`,subtitles:`${subtitles.length} subtitle ${subtitles.length===1?'track':'tracks'}`,verified:true,detail:[...audio,...subtitles].join('\n')};
  }
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
export type CaptionSegment={text:string;italic?:boolean;bold?:boolean;underline?:boolean};
// Turns cue markup into plain styled runs. Only italic, bold and underline survive; colours,
// fonts and voice tags give way to the viewer's subtitle style. {\an7}–{\an9} move a cue to the top.
export function captionLines(text:string){
  const top=/\{\\an[789]\}/.test(text),lines:CaptionSegment[][]=[],state={italic:0,bold:0,underline:0};
  for(const raw of text.replace(/\{\\[^}]*\}/g,'').replace(/<br\s*\/?>|\\N/gi,'\n').split('\n')){
    const line:CaptionSegment[]=[];
    for(const part of raw.split(/(<\/?[a-z][^>]*>)/i)){
      const tag=/^<(\/?)([a-z]+)/i.exec(part);
      if(tag){const key=({i:'italic',b:'bold',u:'underline'} as Record<string,keyof typeof state>)[tag[2].toLowerCase()];if(key)state[key]=Math.max(0,state[key]+(tag[1]?-1:1));continue;}
      const value=part.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
      if(value)line.push({text:value,...(state.italic?{italic:true}:{}),...(state.bold?{bold:true}:{}),...(state.underline?{underline:true}:{})});
    }
    if(line.some(segment=>segment.text.trim()))lines.push(line);
  }
  return {top,lines};
}

