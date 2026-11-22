// Shared by the subtitle sites that hand out ZIP or RAR archives (Subtitrari-noi.ro, subs.ro, YIFY):
// bounded downloads, archive reading, episode matching and text decoding.
import {unzipSync} from 'fflate';
import {releaseMatch} from './online-subtitles.mjs';

export const SUBTITLE_FILE_LIMIT=5*1024*1024,SUBTITLE_ARCHIVE_LIMIT=12*1024*1024;
const textFile=name=>/\.(srt|vtt)$/i.test(name);

export async function limitedBytes(response,limit,label='Subtitle'){
  const tooLarge=()=>Error(label+' response is too large.');
  if(Number(response.headers.get('content-length'))>limit)throw tooLarge();
  if(response.body?.getReader){
    const reader=response.body.getReader(),parts=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw tooLarge();parts.push(Buffer.from(value));}return Buffer.concat(parts,size);}
    finally{await reader.cancel();}
  }
  const value=Buffer.from(await response.arrayBuffer());if(value.length>limit)throw tooLarge();return value;
}

// Files that are not UTF-8 use the old Windows code page of their language: 1250 for Romanian, 1252 for English.
export function decodeSubtitle(bytes,language='ro'){
  if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);
  if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder(language==='en'?'windows-1252':'windows-1250').decode(bytes);}
}

export function episodeNumbers(name){return [...String(name).matchAll(/s(\d{1,3})[ ._-]*e(\d{1,4})|(\d{1,3})x(\d{1,4})/gi)].map(match=>[Number(match[1]??match[3]),Number(match[2]??match[4])]);}
export function matchesEpisode(name,season,episode){return episodeNumbers(name).some(([s,e])=>s===season&&e===episode);}

/** Subtitle files inside a ZIP or RAR archive, as {name,data}. */
export async function archiveFiles(bytes,extractRar){
  if(bytes[0]===80&&bytes[1]===75){
    let total=0,count=0;
    return Object.entries(unzipSync(bytes,{filter:entry=>{if(++count>1000)throw Error('Subtitle archive has too many entries.');if(!textFile(entry.name))return false;total+=entry.originalSize;if(entry.originalSize>SUBTITLE_FILE_LIMIT||total>20*1024*1024)throw Error('Subtitle archive is too large.');return true;}})).map(([name,data])=>({name,data}));
  }
  if(bytes.subarray(0,4).toString()==='Rar!'){
    if(!extractRar)throw Error('This archive is RAR. Choose a ZIP version or load an extracted SRT file.');
    return extractRar(bytes);
  }
  throw Error('The subtitle site did not return a ZIP or RAR archive. Choose another version.');
}

const LANGUAGE_MARKS={
  ro:{own:/[._ -](?:ro|rom|rum|ron)[._ -]|romanian|romana/i,other:/[._ -](?:en|eng|english)[._ -]/i,name:'Romanian'},
  en:{own:/[._ -](?:en|eng)[._ -]|english/i,other:/[._ -](?:ro|rom|rum|ron)[._ -]|romanian|romana/i,name:'English'},
};
/**
 * The readable subtitle in an archive for this language and, for a season pack, this episode.
 * Files marked as another language are skipped; the release closest to the video wins.
 */
export function pickSubtitle(files,{language='ro',season,episode,filename=''}={}){
  const marks=LANGUAGE_MARKS[language]??LANGUAGE_MARKS.ro;
  const candidates=files.filter(file=>textFile(file.name)&&file.data.length<=SUBTITLE_FILE_LIMIT&&!marks.other.test(file.name)&&(season===undefined||matchesEpisode(file.name,season,episode)));
  const own=name=>marks.own.test(name)?1:0;
  candidates.sort((a,b)=>own(b.name)-own(a.name)||releaseMatch(b.name,filename)-releaseMatch(a.name,filename));
  for(const file of candidates){const text=decodeSubtitle(file.data,language);if(text.includes('-->'))return text;}
  throw Error(season===undefined?`No readable ${marks.name} subtitle was found in this archive.`:`This archive has no readable ${marks.name} subtitle for the selected episode.`);
}

export function htmlText(value){
  return String(value??'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim().slice(0,1000);
}
