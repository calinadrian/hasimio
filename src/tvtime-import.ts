import {type Meta} from './media';
import {type ProgressMap,progressKey} from './playback-progress';

const trackingFiles=new Set(['tracking-prod-records-v2.csv','tracking-prod-records.csv']);
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
export function zipCrc(bytes:Uint8Array){let crc=0xffffffff;for(const value of bytes)crc=crcTable[(crc^value)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export type TVTimeEpisode={season:number;episode:number;watchedAt:number;runtime:number};
export type TVTimeShow={tvdb:string;name:string;episodes:TVTimeEpisode[]};
export type TVTimeMatch={show:TVTimeShow;meta?:Meta;error?:string};

// Read only the two watch-history tables. Tokens, account details and other CSVs stay untouched.
export async function readTVTimeZip(buffer:ArrayBuffer):Promise<Record<string,string>>{
  if(buffer.byteLength>25*1024*1024)throw new Error('Choose a TV Time ZIP smaller than 25 MB.');
  const bytes=new Uint8Array(buffer),view=new DataView(buffer),decoder=new TextDecoder();
  const invalid=()=>new Error('This is not a supported TV Time ZIP export.');
  let end=bytes.length-22;
  for(;end>=Math.max(0,bytes.length-65557);end--)if(view.getUint32(end,true)===0x06054b50&&end+22+view.getUint16(end+20,true)===bytes.length)break;
  if(end<Math.max(0,bytes.length-65557))throw invalid();
  const count=view.getUint16(end+10,true),directorySize=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||count>2000||offset+directorySize>end)throw invalid();
  const result:Record<string,string>={};let cursor=offset,total=0;
  for(let i=0;i<count;i++){
    if(cursor+46>offset+directorySize||view.getUint32(cursor,true)!==0x02014b50)throw invalid();
    const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),crc=view.getUint32(cursor+16,true),compressed=view.getUint32(cursor+20,true),size=view.getUint32(cursor+24,true),nameLength=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),local=view.getUint32(cursor+42,true);
    const next=cursor+46+nameLength+extra+comment;if(next>offset+directorySize)throw invalid();
    const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength)).split(/[\\/]/).at(-1)!;cursor=next;
    if(!trackingFiles.has(name))continue;
    if(name in result)throw new Error('The ZIP contains duplicate watch-history tables.');
    total+=size;if(flags&1||![0,8].includes(method)||total>50*1024*1024||local+30>offset||view.getUint32(local,true)!==0x04034b50)throw invalid();
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if(start+compressed>offset)throw invalid();
    const payload=bytes.slice(start,start+compressed);
    let output:Uint8Array;
    if(method===0)output=payload;
    else{
      const reader=new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks:Uint8Array[]=[];let length=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>size){await reader.cancel();throw invalid();}chunks.push(value);}}finally{reader.releaseLock();}
      output=new Uint8Array(length);let at=0;for(const chunk of chunks){output.set(chunk,at);at+=chunk.length;}
    }
    if(output.length!==size||zipCrc(output)!==crc)throw invalid();
    result[name]=decoder.decode(output);
  }
  if(!Object.keys(result).length)throw new Error('No TV Time watch-history tables found. Choose the original personal-data ZIP.');
  return result;
}

export function csvRows(text:string):Record<string,string>[] {
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else cell+=c;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('A TV Time CSV contains an unfinished quoted field.');
  if(cell||row.length){row.push(cell);rows.push(row);}
  const header=rows.shift()?.map(value=>value.replace(/^\uFEFF/,'').trim())??[];
  return rows.filter(values=>values.some(Boolean)).map(values=>Object.fromEntries(header.map((key,index)=>[key,values[index]??''])));
}
export function parseTVTime(files:Record<string,string>){
  const groups=new Map<string,{name:string;episodes:Map<string,TVTimeEpisode>}>();let skipped=0;
  for(const [filename,text] of Object.entries(files)){
    if(!trackingFiles.has(filename))continue;
    const rows=csvRows(text);
    for(const row of rows){
      const watched=filename.includes('-v2')?/^(?:watch|rewatch)-episode-/.test(row.key??''):row.type==='watch'&&row.entity_type==='episode';
      if(!watched)continue;
      const tvdb=row.s_id||row.series_id,seasonText=row.season_number||row.s_no,episodeText=row.episode_number||row.ep_no;
      const season=Number(seasonText),episode=Number(episodeText),name=row.series_name?.trim();
      if(!/^\d+$/.test(tvdb)||!name||!/^\d+$/.test(seasonText)||!/^\d+$/.test(episodeText)||!Number.isSafeInteger(season)||!Number.isSafeInteger(episode)||episode<1){skipped++;continue;}
      const rawDate=row.updated_at||row.created_at;
      const stamp=row.watch_date&&/^\d+$/.test(row.watch_date)?Number(row.watch_date)*1000:Date.parse(rawDate?.includes('T')?rawDate:rawDate?.replace(' ','T')+'Z');
      const watchedAt=Number.isFinite(stamp)&&stamp>0?stamp:1,runtime=Number(row.runtime);
      const item={season,episode,watchedAt,runtime:Number.isFinite(runtime)&&runtime>0?runtime:0};
      const group=groups.get(tvdb)??{name,episodes:new Map<string,TVTimeEpisode>()},key=`${season}:${episode}`,existing=group.episodes.get(key);
      if(!existing||existing.watchedAt<watchedAt)group.episodes.set(key,item);
      groups.set(tvdb,group);
    }
  }
  const shows:TVTimeShow[]=[...groups].map(([tvdb,group])=>({tvdb,name:group.name,episodes:[...group.episodes.values()].sort((a,b)=>a.season-b.season||a.episode-b.episode)}));
  if(!shows.length)throw new Error('No watched episodes with season and episode numbers were found in this export.');
  return {shows,skipped};
}

// TV Time uses TVDB identities. Exact external-ID lookup avoids same-name remakes.
export async function matchTVTimeShows(shows:TVTimeShow[],signal:AbortSignal,onProgress:(done:number)=>void,fetcher:typeof fetch=fetch):Promise<TVTimeMatch[]>{
  const result:TVTimeMatch[]=[];
  for(const show of shows){
    signal.throwIfAborted();
    try{
      let response:Response|undefined;
      for(let attempt=0;attempt<3;attempt++){
        response=await fetcher(`https://api.tvmaze.com/lookup/shows?thetvdb=${show.tvdb}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])});
        if(response.status!==429)break;
        await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},3000);signal.addEventListener('abort',abort,{once:true});});
      }
      if(!response?.ok)throw new Error(response?.status===404?'No exact TVDB match':'Lookup unavailable; retry later');
      const data=await response.json(),id=data.externals?.imdb;
      if(!/^tt\d+$/.test(id)||String(data.externals?.thetvdb)!==show.tvdb)throw new Error('No IMDb identity available');
      result.push({show,meta:{id,type:'series',name:data.name||show.name,poster:data.image?.original??data.image?.medium,runtime:data.averageRuntime?`${data.averageRuntime} min`:undefined,releaseInfo:data.premiered?.slice(0,4),metadataPartial:true}});
    }catch(error){if(signal.aborted)throw error;result.push({show,error:error instanceof Error?error.message:'Lookup failed'});}
    onProgress(result.length);
  }
  return result;
}
export function buildTVTimeImport(matches:TVTimeMatch[],current:ProgressMap){
  const history:ProgressMap={},titles:Meta[]=[];let preserved=0;
  for(const {show,meta} of matches){
    if(!meta||!/^tt\d+$/.test(meta.id))continue;
    titles.push(meta);
    for(const entry of show.episodes){
      const videoId=`${meta.id}:${entry.season}:${entry.episode}`,key=progressKey('series',videoId);
      if(current[key]||history[key]){preserved++;continue;}
      const duration=entry.runtime||1;
      history[key]={position:duration,duration,completed:true,manual:true,updatedAt:entry.watchedAt,titleKey:progressKey('series',meta.id),videoId,episodeLabel:`S${entry.season} · E${entry.episode}`};
    }
  }
  return {history,titles,preserved};
}
