// Backup subtitles from OpenSubtitles, through the free Stremio OpenSubtitles add-on.
// Downloads are re-encoded to UTF-8 by its mirror, so the player can read every language.
const addon='https://opensubtitles-v3.strem.io';
const download=/^https:\/\/subs\d*\.strem\.io\/[a-z-]+\/download\/subencoding-stremio-utf8\/src-api\/file\/(\d+)$/;
export const MAX_SUBTITLE_BYTES=5*1024*1024;

const words=text=>new Set(String(text||'').toLowerCase().replace(/\.[a-z\d]{2,4}$/,'').split(/[^a-z\d]+/).filter(word=>word.length>1));
// Subtitles cut for the same release line up best, so rank by shared release-name words.
export function releaseMatch(name,filename){
  const wanted=words(filename);if(!wanted.size)return 0;
  let shared=0;for(const word of words(name))if(wanted.has(word))shared++;
  return shared/wanted.size;
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
