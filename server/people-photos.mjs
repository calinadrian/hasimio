import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const headers={'User-Agent':'Hasimio (https://github.com/calinadrian/hasimio)',Accept:'application/json'};
const plain=value=>String(value??'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim().slice(0,400);
function safeUrl(value,host){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!host||url.hostname===host)?url.href:undefined;}catch{return undefined;}}
export async function lookupActorPhotos(ids,{fetchImpl=fetch,signal}={}){
  if(!ids.length)return {};
  if(ids.length>30||ids.some(id=>!/^nm\d+$/.test(id)))throw Error('Invalid actor photo IDs.');
  const json=async url=>{
    const response=await fetchImpl(url,{headers,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Actor photos returned HTTP '+response.status);
    const data=await response.json();if(data.error)throw Error('Actor photo service could not complete the lookup.');return data;
  };
  const query=new URL('https://query.wikidata.org/sparql');
  query.searchParams.set('query',`SELECT ?imdb ?image WHERE { VALUES ?imdb { ${ids.map(id=>'"'+id+'"').join(' ')} } ?person wdt:P345 ?imdb; wdt:P18 ?image. }`);query.searchParams.set('format','json');
  const bindings=(await json(query)).results?.bindings;
  if(!Array.isArray(bindings))throw Error('Invalid actor photo response.');
  const files=new Map();
  for(const binding of bindings){
    const id=binding?.imdb?.value;if(!ids.includes(id)||files.has(id))continue;
    try{const url=new URL(binding.image?.value);if(url.hostname!=='commons.wikimedia.org'||!url.pathname.startsWith('/wiki/Special:FilePath/'))continue;files.set(id,'File:'+decodeURIComponent(url.pathname.slice('/wiki/Special:FilePath/'.length)));}catch{/* No safe file identity. */}
  }
  const result={},titles=[...new Set(files.values())];
  // Attribution metadata is expensive: request small batches, not a whole cast at once.
  for(let start=0;start<titles.length;start+=5){
    const api=new URL('https://commons.wikimedia.org/w/api.php');
    for(const [key,value]of Object.entries({action:'query',format:'json',formatversion:'2',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'240',iiextmetadatafilter:'Artist|LicenseShortName|LicenseUrl',titles:titles.slice(start,start+5).join('|')}))api.searchParams.set(key,value);
    const response=await json(api),renamed=new Map((response.query?.normalized??[]).map(r=>[r.from,r.to]));
    for(const page of response.query?.pages??[]){
      const info=page.imageinfo?.[0];let image=safeUrl(info?.thumburl);
      if(!image||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(new URL(image).hostname))continue;
      const clean=new URL(image);clean.search='';image=clean.href;
      const source=safeUrl(info?.descriptionurl,'commons.wikimedia.org');if(!source)continue;
      for(const [id,title]of files)if((renamed.get(title)??title)===page.title)result[id]={image,source,credit:plain(info.extmetadata?.Artist?.value),license:plain(info.extmetadata?.LicenseShortName?.value),licenseUrl:safeUrl(info.extmetadata?.LicenseUrl?.value)};
    }
  }
  return result;
}
export function createActorPhotos({dir,fetchImpl=fetch,now=Date.now}){
  let db;const controller=new AbortController(),pending=new Map();let closed=false;
  function cache(){if(!db){mkdirSync(dir,{recursive:true});db=new DatabaseSync(path.join(dir,'photos.db'));db.exec('CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,value TEXT,expires INTEGER) WITHOUT ROWID');}return db;}
  async function photos(ids){
    ids=[...new Set(ids)];if(ids.length>30||!ids.length||ids.some(id=>!/^nm\d+$/.test(id)))throw Object.assign(Error('Invalid actor photo IDs.'),{status:400});
    if(closed)return {photos:{}};
    const result={},missing=[];
    for(const id of ids){const row=cache().prepare('SELECT value,expires FROM photos WHERE id=?').get(id);if(row&&row.expires>now()){if(row.value)result[id]=JSON.parse(row.value);}else if(!pending.has(id))missing.push(id);}
    if(missing.length){
      const batch=lookupActorPhotos(missing,{fetchImpl,signal:controller.signal}).then(found=>{
        if(!closed)for(const id of missing)cache().prepare('INSERT OR REPLACE INTO photos VALUES(?,?,?)').run(id,found[id]?JSON.stringify(found[id]):null,now()+(found[id]?30:7)*86400000);
        return found;
      }).catch(()=>{
        // Transient failures retry soon, without hammering the source on every render.
        if(!closed)for(const id of missing)cache().prepare('INSERT OR REPLACE INTO photos VALUES(?,?,?)').run(id,null,now()+5*60000);
        return {};
      });
      for(const id of missing)pending.set(id,batch.then(found=>found[id]).finally(()=>pending.delete(id)));
    }
    await Promise.all(ids.map(async id=>{const photo=await pending.get(id);if(photo)result[id]=photo;}));
    return {photos:result};
  }
  async function close(){closed=true;controller.abort();await Promise.allSettled([...pending.values()]);db?.close();db=undefined;}
  return {photos,close};
}
