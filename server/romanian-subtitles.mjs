// Public Romanian subtitle search and downloads; no account or API key.
import {SUBTITLE_ARCHIVE_LIMIT as archiveLimit,archiveFiles,episodeNumbers,limitedBytes as boundedBytes,matchesEpisode,pickSubtitle} from './subtitle-archive.mjs';
import {releaseMatch} from './online-subtitles.mjs';
const site='https://www.subtitrari-noi.ro';
const entities=value=>String(value??'').replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ');
const plain=value=>entities(value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1000);
export function createRomanianSubtitles({fetchImpl=fetch,extractRar}={}){
  const cache=new Map(),downloads=new Map();
  async function request(url,{body,limit=archiveLimit}={}){
    let response;
    try{response=await fetchImpl(url,{method:body?'POST':'GET',headers:{'User-Agent':'Hasimio','Referer':site+'/','X-Requested-With':'XMLHttpRequest',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw Error('Subtitrari-noi.ro could not be reached.');}
    if(!response.ok)throw Error('Subtitrari-noi.ro returned HTTP '+response.status+'.');
    return boundedBytes(response,limit,'Romanian subtitle');
  }
  async function search(id,filename=''){
    const match=/^(tt\d+)(?::(\d+):(\d+))?$/.exec(id);if(!match)return {subtitles:[]};
    const imdb=match[1],season=match[2]===undefined?undefined:Number(match[2]),episode=match[3]===undefined?undefined:Number(match[3]);
    let item=cache.get(imdb);
    if(!item||item.expires<Date.now()){
      // The site's search matches the IMDb number without its "tt" prefix (late 2026).
      const digits=imdb.slice(2),body=new URLSearchParams({search_q:'1',query_q:digits,cautare:digits,tip:'2',page_nr:'1'}).toString();
      const promise=request(site+'/paginare_filme.php',{body,limit:2*1024*1024}).then(bytes=>bytes.toString('utf8'));
      item={expires:Date.now()+300000,promise};cache.set(imdb,item);if(cache.size>64)cache.delete(cache.keys().next().value);promise.catch(()=>cache.delete(imdb));
    }
    const html=await item.promise;
    const subtitles=[];
    for(const block of html.split(/<div\s+(?:align=["'][^"']*["']\s+)?id=["']round["'][^>]*>/i).slice(1,41)){
      if(!new RegExp('imdb\\.com/title/'+imdb+'(?:[/\\s"\'?#]|$)','i').test(block))continue;
      const hrefs=[...block.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(value=>entities(value[1]));
      const href=hrefs.find(value=>/\.(zip|rar)(?:\?|$)/i.test(value));if(!href)continue;
      let url;try{url=new URL(href,site+'/');}catch{continue;}
      if(url.origin!==site||url.search||!/^\/\d{1,12}[-_]/.test(url.pathname))continue;
      const record=/^\/(\d{1,12})[-_]/.exec(url.pathname)[1];
      const title=plain(/<a[^>]*href=["'][^"']*movie_details[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1]??'Romanian subtitles');
      const comment=plain(/font-weight:bold;font-style:italic[^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1]??'');
      const release=[title,comment].filter(Boolean).join(' · '),marks=episodeNumbers(release);
      if(season!==undefined&&marks.length&&!matchesEpisode(release,season,episode))continue;
      const token='noi-'+record+(season===undefined?'':'-'+season+'-'+episode);
      downloads.set(token,{url:url.href,filename,season,episode,expires:Date.now()+1800000});
      if(downloads.size>256)downloads.delete(downloads.keys().next().value);
      subtitles.push({id:token,language:'rum',release,match:Math.round(releaseMatch(release,filename)*100)/100,provider:'Subtitrari-noi.ro'});
    }
    return {subtitles:subtitles.sort((a,b)=>b.match-a.match)};
  }
  async function download(id){
    const item=downloads.get(id);if(!item||item.expires<Date.now())throw Error('Search again to refresh this Romanian subtitle download.');
    const bytes=await request(item.url);
    return pickSubtitle(await archiveFiles(bytes,extractRar),{language:'ro',season:item.season,episode:item.episode,filename:item.filename});
  }
  return {search,download};
}
