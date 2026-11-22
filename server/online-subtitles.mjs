// Backup subtitles from OpenSubtitles, through the free Stremio OpenSubtitles add-on.
// Downloads are re-encoded to UTF-8 by its mirror, so the player can read every language.
const addon='https://opensubtitles-v3.strem.io';
const download=/^https:\/\/subs\d*\.strem\.io\/[a-z-]+\/download\/subencoding-stremio-utf8\/src-api\/file\/(\d+)$/;
export const MAX_SUBTITLE_BYTES=5*1024*1024;

const plain=text=>String(text||'').toLowerCase().replace(/\.(mkv|mp4|avi|m4v|ts|srt|sub|vtt|ass|ssa|zip|rar)$/,'')
  // Spellings of the same source must compare equal.
  .replace(/\bweb[\s._-]?dl\b/g,'webdl').replace(/\bweb[\s._-]?rip\b/g,'webrip').replace(/\bblu[\s._-]?ray\b/g,'bluray').replace(/\bbr[\s._-]?rip\b/g,'brrip').replace(/\bbd[\s._-]?rip\b/g,'bdrip').replace(/\bdvd[\s._-]?rip\b/g,'dvdrip').replace(/\bhd[\s._-]?rip\b/g,'hdrip');
const words=text=>new Set(plain(text).split(/[^a-z\d]+/).filter(word=>word.length>1));
// Where a subtitle was cut decides its timing: Blu-ray, streaming and TV
// captures often differ in intros, cuts and frame rate.
// Sources in one family usually share timing (a WEBRip and a WEB-DL of the
// same stream); different families rarely do.
const FAMILIES={
  web:['webdl','webrip','web','amzn','nf','dsnp','hmax','atvp','hulu','pcok','max'],
  bluray:['bluray','bdrip','brrip','bdremux','remux'],
  dvd:['dvdrip','dvd'],
  tv:['hdtv','pdtv'],
  cam:['cam','hdcam','ts','telesync'],
  hdrip:['hdrip'],
};
const FAMILY=new Map(Object.entries(FAMILIES).flatMap(([family,names])=>names.map(name=>[name,family])));
const RESOLUTION=/^(2160p|1080p|720p|576p|480p|4k|uhd)$/;
const releaseGroup=text=>/-([a-z\d]{2,})(?:\[[^\]]*\])?$/.exec(plain(text).trim())?.[1];
/**
 * 0..1 likelihood that a subtitle was cut for this exact video file. The
 * release group and source weigh most. A source from the same family earns
 * half credit; a different family halves the score, since its timing rarely
 * lines up.
 */
export function releaseMatch(name,filename){
  const wanted=words(filename);if(!wanted.size)return 0;
  const have=words(name),group=releaseGroup(filename);
  const haveFamilies=new Set([...have].map(word=>FAMILY.get(word)).filter(Boolean));
  let total=0,shared=0;
  for(const word of wanted){
    const family=FAMILY.get(word);
    const weight=word===group?4:family?3:RESOLUTION.test(word)?1.5:1;
    total+=weight;
    if(have.has(word))shared+=weight;else if(family&&haveFamilies.has(family))shared+=weight/2;
  }
  let score=shared/total;
  const wantedFamilies=new Set([...wanted].map(word=>FAMILY.get(word)).filter(Boolean));
  if(wantedFamilies.size&&haveFamilies.size&&![...haveFamilies].some(family=>wantedFamilies.has(family)))score*=0.5;
  return Math.min(1,score);
}
export function onlineSubtitleResults(payload,filename){
  if(!Array.isArray(payload?.subtitles))throw new Error('OpenSubtitles returned an invalid response.');
  const seen=new Set();
  return payload.subtitles.flatMap(item=>{
    const file=typeof item?.url==='string'?download.exec(item.url)?.[1]:undefined;
    const language=typeof item?.lang==='string'&&/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(item.lang)?item.lang.toLowerCase():undefined;
    if(!file||!language||seen.has(file))return [];seen.add(file);
    const release=[item.subtitleFileName,item.movieReleaseName].find(value=>typeof value==='string'&&value.trim())?.trim()??'OpenSubtitles';
    return [{id:file,language,release,match:Math.round(Math.max(releaseMatch(item.subtitleFileName,filename),releaseMatch(item.movieReleaseName,filename))*100)/100}];
  }).sort((a,b)=>b.match-a.match);
}
export async function searchOnlineSubtitles(id,filename,fetchImpl=fetch){
  if(!/^tt\d+(?::\d+:\d+)?$/.test(id))throw new Error('Online subtitles need an IMDb movie or episode ID.');
  const url=`${addon}/subtitles/${id.includes(':')?'series':'movie'}/${encodeURIComponent(id)}.json`;
  let response;try{response=await fetchImpl(url,{signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw new Error('OpenSubtitles could not be reached. Check your connection and try again.');}
  if(!response.ok)throw new Error(`OpenSubtitles returned HTTP ${response.status}.`);
  let payload;try{payload=await response.json();}catch{throw new Error('OpenSubtitles returned an invalid response.');}
  return {subtitles:onlineSubtitleResults(payload,filename)};
}
export async function downloadOnlineSubtitle(file,fetchImpl=fetch){
  if(!/^\d{1,12}$/.test(file))throw new Error('Choose a subtitle from the online list.');
  let response;try{response=await fetchImpl(`https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/${file}`,{signal:AbortSignal.timeout(30000)});}catch{throw new Error('The subtitle download could not be reached. Try another subtitle.');}
  if(!response.ok)throw new Error(`The subtitle download returned HTTP ${response.status}. Try another subtitle.`);
  if(Number(response.headers.get('content-length'))>MAX_SUBTITLE_BYTES)throw new Error('This subtitle file is too large.');
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>MAX_SUBTITLE_BYTES)throw new Error('This subtitle file is too large.');
  return new TextDecoder('utf-8').decode(bytes);
}

const SOURCE_LANGUAGE={ro:'ro',ron:'ro',rum:'ro',en:'en',eng:'en'};
const EXTRA_SOURCE_DEADLINE=10000;
function withDeadline(promise,ms,message){
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));
}
// A failed provider must not hide subtitles from the others. `sources` are the extra Romanian and
// English sites (subtitle-sources.mjs); each answers only for the languages it lists.
export function createOnlineSubtitleService({romanian,sources=[],fetchImpl=fetch}={}){
  async function search(id,filename,language=''){
    const wanted=SOURCE_LANGUAGE[String(language).toLowerCase()];
    const providers=[{name:'OpenSubtitles',search:()=>searchOnlineSubtitles(id,filename,fetchImpl)}];
    if(romanian&&wanted==='ro')providers.push({name:'Subtitrari-noi.ro',search:()=>romanian.search(id,filename)});
    // One deadline per extra source, however many requests it chains, so a slow site cannot hold up the list.
    for(const source of sources)if(wanted&&source.languages.includes(wanted))providers.push({name:source.name,search:()=>withDeadline(source.search(id,filename,wanted),EXTRA_SOURCE_DEADLINE,source.name+' took too long to answer.')});
    const results=await Promise.allSettled(providers.map(provider=>provider.search()));
    const subtitles=results.flatMap((result,index)=>result.status==='fulfilled'?result.value.subtitles.map(item=>({...item,provider:item.provider??providers[index].name})):[]);
    const warnings=results.flatMap(result=>result.status==='rejected'?[result.reason instanceof Error?result.reason.message:'A subtitle source is unavailable.']:[]);
    if(results.every(result=>result.status==='rejected'))throw Error(warnings.join(' '));
    return {subtitles:subtitles.sort((a,b)=>b.match-a.match),warnings};
  }
  function download(id){
    if(id.startsWith('noi-'))return romanian.download(id);
    const source=sources.find(item=>id.startsWith(item.prefix));
    return source?source.download(id):downloadOnlineSubtitle(id,fetchImpl);
  }
  return {search,download};
}
