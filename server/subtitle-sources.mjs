// More Romanian and English subtitle sources, used next to OpenSubtitles and Subtitrari-noi.ro:
//   subs.ro                 Romanian (and some English), movies and series, ZIP/RAR archives
//   YIFY Subtitles          Romanian and English, movies only, ZIP archives
//   Addic7ed (via Gestdown) English and Romanian, series only, plain SRT
// None needs an account or key. A download id carries everything the download needs,
// so a list stays usable after the engine restarts.
import {releaseMatch} from './online-subtitles.mjs';
import {SUBTITLE_ARCHIVE_LIMIT,SUBTITLE_FILE_LIMIT,archiveFiles,decodeSubtitle,htmlText,limitedBytes,pickSubtitle} from './subtitle-archive.mjs';

// Scraped sites get less time than OpenSubtitles: one slow site must not hold up the whole list.
const TIMEOUT=8000;
const LANGUAGE_CODE={ro:'rum',en:'eng'};
const score=(release,filename)=>Math.round(releaseMatch(release,filename)*100)/100;
export function parseVideoId(id){
  const match=/^tt(\d{1,10})(?::(\d{1,3}):(\d{1,4}))?$/.exec(String(id));
  return match?{imdb:'tt'+match[1],digits:match[1],season:match[2]===undefined?undefined:Number(match[2]),episode:match[3]===undefined?undefined:Number(match[3])}:undefined;
}
const episodeSuffix=({season,episode})=>season===undefined?'':`-${season}-${episode}`;
const episodeFromSuffix=(season,episode)=>season===undefined?{}:{season:Number(season),episode:Number(episode)};

function createRequester(fetchImpl,name,headers={}){
  return async function request(url,{limit=SUBTITLE_ARCHIVE_LIMIT,accept,referer}={}){
    let response;
    try{response=await fetchImpl(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; Hasimio)',...(accept?{Accept:accept}:{}),...headers,...(referer?{Referer:referer}:{})},signal:AbortSignal.timeout(TIMEOUT),redirect:'follow'});}
    catch{throw Error(name+' could not be reached.');}
    if(response.status===429)throw Object.assign(Error(name+' is limiting requests. Wait a minute or choose another source.'),{status:429});
    if(!response.ok)throw Object.assign(Error(name+' returned HTTP '+response.status+'.'),{status:response.status});
    return limitedBytes(response,limit,name);
  };
}
// Archives often hold several cuts of one episode. The video's file name from the search picks the
// closest one at download time; ids stay usable without it, falling back to the archive order.
function releaseHints(){
  const hints=new Map();
  return {
    remember(results,filename){if(!filename)return results;for(const item of results){hints.delete(item.id);hints.set(item.id,filename);if(hints.size>512)hints.delete(hints.keys().next().value);}return results;},
    filename:id=>hints.get(id)??'',
  };
}
// Five minutes of page cache keeps the panel, automatic loading and sync from asking twice.
function pageCache(load){
  const cache=new Map();
  return key=>{
    let item=cache.get(key);
    if(!item||item.expires<Date.now()){
      const promise=load(key);item={expires:Date.now()+300000,promise};cache.set(key,item);
      if(cache.size>64)cache.delete(cache.keys().next().value);
      promise.catch(()=>cache.delete(key));
    }
    return item.promise;
  };
}

/* ---------- subs.ro ---------- */
export function subsRoResults(html,{digits,season,episode,filename='',language='ro'}){
  const subtitles=[],seen=new Set();
  // Each listing entry opens with a tag carrying its subtitle id, IMDb id and language; its title,
  // release notes and download link follow before the next entry.
  for(const block of String(html).split(/(?=<[^>]*\bdata-imdb-id=")/).slice(0,61)){
    const tag=/^<[^>]*>/.exec(block)?.[0]??'';
    const attribute=name=>new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
    const sid=attribute('data-subtitle-id'),imdb=attribute('data-imdb-id'),lang=attribute('data-language');
    if(!sid||!/^\d{1,12}$/.test(sid)||Number(imdb)!==Number(digits)||lang!==language||seen.has(sid))continue;
    // The title link names the same subtitle, or this block is not one listing entry.
    const heading=/<a\b[^>]*\bhref="[^"]*\/subtitrare\/[^"/]*\/(\d{1,12})"[^>]*\btitle="Subtitrare\s*([^"]*)"/.exec(block);
    if(!heading||heading[1]!==sid)continue;
    const title=htmlText(heading[2]);
    const comment=htmlText(/data-field="comment-text"[^>]*>([\s\S]*?)<\/div>/.exec(block)?.[1]??'').slice(0,200);
    // Series entries are season packs ("Sezonul 2"); the episode is picked from the archive.
    // Without one in the title, release notes that name only other seasons rule the entry out.
    const packSeason=/sezonul\s*(\d{1,3})/i.exec(title)?.[1];
    if(season!==undefined&&packSeason!==undefined&&Number(packSeason)!==season)continue;
    const notedSeasons=[...comment.matchAll(/(?:sezon(?:ul)?|season)\s*(\d{1,3})/gi)].map(match=>Number(match[1]));
    if(season!==undefined&&packSeason===undefined&&notedSeasons.length&&!notedSeasons.includes(season))continue;
    seen.add(sid);
    const release=[title||'subs.ro',comment].filter(Boolean).join(' · ');
    subtitles.push({id:`subsro-${language}-${sid}${episodeSuffix({season,episode})}`,language:LANGUAGE_CODE[language],release,match:score(release,filename),provider:'subs.ro'});
  }
  return subtitles.sort((a,b)=>b.match-a.match);
}
export function createSubsRo({fetchImpl=fetch,extractRar}={}){
  const site='https://subs.ro',request=createRequester(fetchImpl,'subs.ro',{Referer:site+'/'});
  const listing=pageCache(digits=>request(`${site}/subtitrari/imdbid/${digits}`,{limit:4*1024*1024}).then(bytes=>bytes.toString('utf8')));
  const hints=releaseHints();
  return {
    name:'subs.ro',prefix:'subsro-',languages:['ro','en'],
    async search(id,filename,language){
      const video=parseVideoId(id);if(!video)return {subtitles:[]};
      return {subtitles:hints.remember(subsRoResults(await listing(video.digits),{...video,filename,language}),filename)};
    },
    async download(id){
      const match=/^subsro-(ro|en)-(\d{1,12})(?:-(\d{1,3})-(\d{1,4}))?$/.exec(id);if(!match)throw Error('Choose a subtitle from the online list.');
      const bytes=await request(`${site}/subtitrare/descarca/subtitrare/${match[2]}`);
      return pickSubtitle(await archiveFiles(bytes,extractRar),{language:match[1],...episodeFromSuffix(match[3],match[4]),filename:hints.filename(id)});
    },
  };
}

/* ---------- YIFY Subtitles ---------- */
const YIFY_LANGUAGES={romanian:'ro',english:'en'};
export function yifyResults(html,{filename='',language='en'}){
  const subtitles=[],seen=new Set();
  for(const row of String(html).split(/<tr\b/i).slice(1,301)){
    const lang=YIFY_LANGUAGES[htmlText(/class="sub-lang"[^>]*>([\s\S]*?)<\/span>/i.exec(row)?.[1]??'').toLowerCase()];
    const link=/<a\s+href="\/subtitles\/([a-z0-9-]{1,200})"[^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if(lang!==language||!link||seen.has(link[1]))continue;seen.add(link[1]);
    const release=htmlText(link[2]).replace(/^subtitle\s+/i,'')||'YIFY';
    const rating=Number(/class="label[^"]*"[^>]*>(-?\d{1,5})</.exec(row)?.[1]??0);
    subtitles.push({id:`yify-${language}-${link[1]}`,language:LANGUAGE_CODE[language],release,match:score(release,filename),provider:'YIFY Subtitles',rating});
  }
  // Rows rarely name their release, so the best-rated version comes first among equals.
  return subtitles.sort((a,b)=>b.match-a.match||b.rating-a.rating).map(({rating,...item})=>item);
}
export function createYify({fetchImpl=fetch}={}){
  const site='https://yifysubtitles.ch',request=createRequester(fetchImpl,'YIFY Subtitles');
  const listing=pageCache(imdb=>request(`${site}/movie-imdb/${imdb}`,{limit:3*1024*1024}).then(bytes=>bytes.toString('utf8')).catch(error=>{if(error.status===404)return '';throw error;}));
  const hints=releaseHints();
  return {
    name:'YIFY Subtitles',prefix:'yify-',languages:['ro','en'],
    async search(id,filename,language){
      const video=parseVideoId(id);if(!video||video.season!==undefined)return {subtitles:[]};
      return {subtitles:hints.remember(yifyResults(await listing(video.imdb),{filename,language}),filename)};
    },
    async download(id){
      const match=/^yify-(ro|en)-([a-z0-9-]{1,200})$/.exec(id);if(!match)throw Error('Choose a subtitle from the online list.');
      // The archive is only served to a visitor coming from its subtitle page.
      const bytes=await request(`${site}/subtitle/${match[2]}.zip`,{referer:`${site}/subtitles/${match[2]}`});
      return pickSubtitle(await archiveFiles(bytes),{language:match[1],filename:hints.filename(id)});
    },
  };
}

/* ---------- Addic7ed, through the Gestdown API ---------- */
const ADDIC7ED_LANGUAGES={ro:'Romanian',en:'English'};
export function addic7edResults(payload,{show='',filename='',language='en'}){
  if(!Array.isArray(payload?.matchingSubtitles))return [];
  const seen=new Set();
  return payload.matchingSubtitles.flatMap(item=>{
    const sid=typeof item?.subtitleId==='string'&&/^[A-Za-z0-9]{6,40}$/.test(item.subtitleId)?item.subtitleId:undefined;
    if(!sid||item.completed===false||seen.has(sid))return [];seen.add(sid);
    const version=typeof item.version==='string'?item.version.trim().slice(0,200):'';
    const release=[show,version,item.hearingImpaired?'HI':''].filter(Boolean).join(' · ')||'Addic7ed';
    return [{id:'a7-'+sid,language:LANGUAGE_CODE[language],release,match:score(version,filename),provider:'Addic7ed'}];
  }).sort((a,b)=>b.match-a.match);
}
export function createAddic7ed({fetchImpl=fetch}={}){
  const api='https://api.gestdown.info',request=createRequester(fetchImpl,'Addic7ed');
  const json=async(url,limit=2*1024*1024)=>JSON.parse((await request(url,{limit,accept:'application/json'})).toString('utf8'));
  // Gestdown knows shows by TheTVDB id, which Cinemeta lists for an IMDb id.
  const showFor=pageCache(async imdb=>{
    const meta=await json(`https://v3-cinemeta.strem.io/meta/series/${imdb}.json`);
    const tvdb=meta?.meta?.tvdb_id;if(!Number.isSafeInteger(Number(tvdb))||Number(tvdb)<=0)return undefined;
    const shows=await json(`${api}/shows/external/tvdb/${Number(tvdb)}`).catch(error=>{if(error.status===404)return {shows:[]};throw error;});
    const show=Array.isArray(shows?.shows)?shows.shows.find(item=>typeof item?.id==='string'&&/^[A-Za-z0-9]{6,40}$/.test(item.id)):undefined;
    return show&&{id:show.id,name:typeof show.name==='string'?show.name.slice(0,200):''};
  });
  return {
    name:'Addic7ed',prefix:'a7-',languages:['ro','en'],
    async search(id,filename,language){
      const video=parseVideoId(id);if(!video||video.season===undefined)return {subtitles:[]};
      const show=await showFor(video.imdb);if(!show)return {subtitles:[]};
      // 404: no such episode; 423: Gestdown is still fetching it from Addic7ed.
      const payload=await json(`${api}/subtitles/get/${show.id}/${video.season}/${video.episode}/${ADDIC7ED_LANGUAGES[language]}`).catch(error=>{if(error.status===404||error.status===423)return {};throw error;});
      return {subtitles:addic7edResults(payload,{show:show.name,filename,language})};
    },
    async download(id){
      const match=/^a7-([A-Za-z0-9]{6,40})$/.exec(id);if(!match)throw Error('Choose a subtitle from the online list.');
      const text=decodeSubtitle(await request(`${api}/subtitles/download/${match[1]}`,{limit:SUBTITLE_FILE_LIMIT}),'en');
      if(!text.includes('-->'))throw Error('Addic7ed returned an unreadable subtitle. Choose another version.');
      return text;
    },
  };
}
