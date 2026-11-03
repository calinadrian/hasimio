// Public Romanian subtitle search and downloads; no account or API key.
import {unzipSync} from 'fflate';
import {releaseMatch} from './online-subtitles.mjs';
const site='https://www.subtitrari-noi.ro';
const fileLimit=5*1024*1024,archiveLimit=12*1024*1024;
const textFile=name=>/\.(srt|vtt)$/i.test(name);
const entities=value=>String(value??'').replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ');
const plain=value=>entities(value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1000);
async function limitedBytes(response,limit){
  if(Number(response.headers.get('content-length'))>limit)throw Error('Romanian subtitle response is too large.');
  if(response.body?.getReader){
    const reader=response.body.getReader(),parts=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Romanian subtitle response is too large.');parts.push(Buffer.from(value));}return Buffer.concat(parts,size);}
    finally{await reader.cancel();}
  }
  const value=Buffer.from(await response.arrayBuffer());if(value.length>limit)throw Error('Romanian subtitle response is too large.');return value;
}
function decode(bytes){
  if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);
  if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('windows-1250').decode(bytes);}
}
function episodeNumbers(name){return [...name.matchAll(/s(\d{1,3})[ ._-]*e(\d{1,4})|(\d{1,3})x(\d{1,4})/gi)].map(match=>[Number(match[1]??match[3]),Number(match[2]??match[4])]);}
function matchesEpisode(name,season,episode){return episodeNumbers(name).some(([s,e])=>s===season&&e===episode);}
export function createRomanianSubtitles({fetchImpl=fetch,extractRar}={}){
  const cache=new Map(),downloads=new Map();
  async function request(url,{body,limit=archiveLimit}={}){
    let response;
    try{response=await fetchImpl(url,{method:body?'POST':'GET',headers:{'User-Agent':'Hasimio','Referer':site+'/','X-Requested-With':'XMLHttpRequest',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw Error('Subtitrari-noi.ro could not be reached.');}
    if(!response.ok)throw Error('Subtitrari-noi.ro returned HTTP '+response.status+'.');
    return limitedBytes(response,limit);
  }
  async function search(id,filename=''){
    const match=/^(tt\d+)(?::(\d+):(\d+))?$/.exec(id);if(!match)return {subtitles:[]};
    const imdb=match[1],season=match[2]===undefined?undefined:Number(match[2]),episode=match[3]===undefined?undefined:Number(match[3]);
    let item=cache.get(imdb);
    if(!item||item.expires<Date.now()){
      const body=new URLSearchParams({search_q:'1',query_q:imdb,cautare:imdb,tip:'2',page_nr:'1'}).toString();
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
    const bytes=await request(item.url);let files;
    if(bytes[0]===80&&bytes[1]===75){
      let total=0,count=0;
      files=Object.entries(unzipSync(bytes,{filter:entry=>{if(++count>1000)throw Error('Subtitle archive has too many entries.');if(!textFile(entry.name))return false;total+=entry.originalSize;if(entry.originalSize>fileLimit||total>20*1024*1024)throw Error('Subtitle archive is too large.');return true;}})).map(([name,data])=>({name,data}));
    }else if(bytes.subarray(0,4).toString()==='Rar!'){
      if(!extractRar)throw Error('This archive is RAR. Choose a ZIP version or load an extracted SRT file.');files=await extractRar(bytes);
    }else throw Error('The subtitle site did not return a ZIP or RAR archive. Choose another version.');
    const candidates=files.filter(file=>textFile(file.name)&&file.data.length<=fileLimit&&!/[._ -](?:en|eng|english)[._ -]/i.test(file.name)&&(item.season===undefined||matchesEpisode(file.name,item.season,item.episode)));
    const romanian=name=>/[._ -](?:ro|rom|rum|ron)[._ -]|romanian|romana/i.test(name)?1:0;
    candidates.sort((a,b)=>romanian(b.name)-romanian(a.name)||releaseMatch(b.name,item.filename)-releaseMatch(a.name,item.filename));
    for(const file of candidates){const text=decode(file.data);if(text.includes('-->'))return text;}
    throw Error(item.season===undefined?'No readable Romanian subtitle was found in this archive.':'This archive has no readable Romanian subtitle for the selected episode.');
  }
  return {search,download};
}
