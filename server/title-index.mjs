// Hasimio's own movie and series index, built on this machine from IMDb's public datasets
// (https://datasets.imdbws.com, personal and non-commercial use). TVmaze adds series artwork,
// summaries and episode air dates; Wikidata and English Wikipedia add movie posters and summaries.
// Only data is consumed; no third-party add-on code runs.
import {DatabaseSync} from 'node:sqlite';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {Readable} from 'node:stream';
import {mkdir,rename,rm,stat} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

export const datasetBase='https://datasets.imdbws.com';
export const tvmazeApi='https://api.tvmaze.com';
export const wikidataSparql='https://query.wikidata.org/sparql';
export const wikipediaApi='https://en.wikipedia.org/w/api.php';
// Wikimedia asks API clients to identify themselves.
const wikiHeaders={'User-Agent':'Hasimio (https://github.com/calinadrian/hasimio)'};
export const MIN_VOTES=1000;
const PAGE=50;
const REFRESH_MS=7*24*60*60*1000;
const searchAndSkip=[{name:'search'},{name:'skip'}];
export const titleIndexManifest={
  id:'org.hasimio.titles',name:'Hasimio Titles',version:'1.0.0',
  description:'Hasimio’s own movie and series index, built locally from IMDb’s public datasets. Wikipedia adds movie posters; TVmaze adds series artwork and episode air dates.',
  types:['movie','series'],idPrefixes:['tt'],resources:['catalog','meta'],
  catalogs:[{id:'popular',type:'movie',name:'Popular movies',extra:searchAndSkip},{id:'popular',type:'series',name:'Popular series',extra:searchAndSkip},{id:'top-rated',type:'movie',name:'Top-rated movies',extra:[{name:'skip'}]},{id:'top-rated',type:'series',name:'Top-rated series',extra:[{name:'skip'}]}],
};

export function normalize(value) { return String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim(); }
const field = value => value === '\\N' || value === '' ? undefined : value;
const count = value => { const n=Number(field(value)); return Number.isSafeInteger(n) && n >= 0 ? n : undefined; };
function image(value) {
  if (typeof value !== 'string') return undefined;
  try { const url=new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
function date(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? value : undefined; }
// TVmaze airstamps carry the broadcast time, so countdowns can show hours rather than whole days.
function stamp(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined; }
// Posters come only from Wikimedia's upload host, without the tracking parameters the API appends.
function wikiImage(value) {
  const href=image(value);if (!href) return undefined;
  const url=new URL(href);if (url.hostname !== 'upload.wikimedia.org') return undefined;
  url.search='';return url.href;
}
const articleTitle = href => { try { const url=new URL(href); return url.hostname === 'en.wikipedia.org' && url.pathname.startsWith('/wiki/') ? decodeURIComponent(url.pathname.slice(6)).replace(/_/g,' ') : undefined; } catch { return undefined; } };
const plainText = html => typeof html === 'string' ? html.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,'\'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim() || undefined : undefined;

export async function* datasetRows(name, fetchImpl, signal) {
  const response=await fetchImpl(`${datasetBase}/${name}`,{redirect:'error',signal});
  if (!response.ok || !response.body) throw new Error(`IMDb datasets returned HTTP ${response.status} for ${name}.`);
  const lines=createInterface({input:Readable.fromWeb(response.body).pipe(createGunzip()),crlfDelay:Infinity});
  let header=true;
  for await (const line of lines) { if (header) { header=false; continue; } yield line.split('\t'); }
}
const rows=datasetRows;

// Builds a fresh index into `file`. Titles need MIN_VOTES ratings; adult titles are skipped.
export async function buildIndex(file, {fetchImpl=fetch,signal,onStep=()=>{}}={}) {
  const db=new DatabaseSync(file);
  try {
    db.exec(`PRAGMA journal_mode=OFF;PRAGMA synchronous=OFF;
      CREATE TABLE titles(id TEXT PRIMARY KEY,type TEXT NOT NULL,name TEXT NOT NULL,search TEXT NOT NULL,start INTEGER,end INTEGER,runtime INTEGER,genres TEXT,rating REAL,votes INTEGER NOT NULL) WITHOUT ROWID;
      CREATE TABLE episodes(id TEXT PRIMARY KEY,parent TEXT NOT NULL,season INTEGER NOT NULL,episode INTEGER NOT NULL,name TEXT,runtime INTEGER) WITHOUT ROWID;
      CREATE TABLE info(key TEXT PRIMARY KEY,value TEXT);`);
    onStep('Downloading ratings');
    const ratings=new Map();
    for await (const [id,rating,votes] of rows('title.ratings.tsv.gz',fetchImpl,signal)) { const n=count(votes); if (n >= MIN_VOTES) ratings.set(id,[Number(rating),n]); }
    db.exec('BEGIN');
    onStep('Downloading episode lists');
    const addEpisode=db.prepare('INSERT OR IGNORE INTO episodes(id,parent,season,episode) VALUES(?,?,?,?)');
    for await (const [id,parent,season,episode] of rows('title.episode.tsv.gz',fetchImpl,signal)) {
      const s=count(season),e=count(episode);
      if (ratings.has(parent) && s != null && e != null) addEpisode.run(id,parent,s,e);
    }
    onStep('Downloading titles');
    const addTitle=db.prepare('INSERT OR IGNORE INTO titles VALUES(?,?,?,?,?,?,?,?,?,?)');
    const nameEpisode=db.prepare('UPDATE episodes SET name=?,runtime=? WHERE id=?');
    for await (const [id,kind,name,,adult,start,end,runtime,genres] of rows('title.basics.tsv.gz',fetchImpl,signal)) {
      if (kind === 'tvEpisode') { nameEpisode.run(field(name)??null,count(runtime)??null,id); continue; }
      const type=kind === 'movie' ? 'movie' : kind === 'tvSeries' || kind === 'tvMiniSeries' ? 'series' : undefined;
      const rated=ratings.get(id);
      if (!type || !rated || adult === '1' || !field(name)) continue;
      addTitle.run(id,type,name,normalize(name),count(start) ?? null,count(end) ?? null,count(runtime) ?? null,field(genres) ?? null,rated[0],rated[1]);
    }
    db.exec('DELETE FROM episodes WHERE parent NOT IN (SELECT id FROM titles)');
    db.prepare('INSERT INTO info VALUES(?,?)').run('builtAt',String(Date.now()));
    db.exec('COMMIT;CREATE INDEX titles_rank ON titles(type,votes);CREATE INDEX episodes_parent ON episodes(parent)');
    return db.prepare('SELECT COUNT(*) AS n FROM titles').get().n;
  } finally { db.close(); }
}

export function titleMeta(row, art) {
  const year=row.start ? String(row.start) : undefined;
  return {id:row.id,type:row.type,name:row.name,
    releaseInfo:row.type === 'series' && year && row.end !== row.start ? `${year}–${row.end ?? ''}` : year,
    imdbRating:typeof row.rating === 'number' ? row.rating.toFixed(1) : undefined,
    votes:Number.isSafeInteger(row.votes) ? row.votes : undefined,
    genres:row.genres ? row.genres.split(',') : undefined,
    runtime:row.runtime ? `${row.runtime} min` : undefined,
    poster:art?.poster,background:art?.background,description:art?.description};
}
export function tvmazeEpisodes(imdb, episodes) {
  if (!Array.isArray(episodes)) throw new Error('TVmaze returned invalid episodes.');
  return episodes.filter(e => Number.isSafeInteger(e?.season) && e.season > 0 && Number.isSafeInteger(e?.number) && e.number > 0)
    .map(e => ({id:`${imdb}:${e.season}:${e.number}`,season:e.season,episode:e.number,title:typeof e.name === 'string' ? e.name : undefined,released:stamp(e.airstamp) ?? date(e.airdate),thumbnail:image(e.image?.medium ?? e.image?.original),...(typeof e.runtime==='number'&&e.runtime>0?{runtime:e.runtime}:{} )}));
}

export function createTitleIndex({dir,fetchImpl=fetch,now=Date.now}={}) {
  const file=path.join(dir,'titles.db');
  let db,building,status={state:'idle'},closed=false;
  const artPending=new Map(),controller=new AbortController();
  const seriesMetadata=new Map(),seriesPending=new Map();
  let lastRequest=0,artDb;
  // Artwork survives restarts and weekly rebuilds in its own file, so each title is looked up once a month at most.
  function artCache() {
    if (!artDb) { mkdirSync(dir,{recursive:true}); artDb=new DatabaseSync(path.join(dir,'artwork.db')); artDb.exec('CREATE TABLE IF NOT EXISTS art(imdb TEXT PRIMARY KEY,value TEXT,expires INTEGER NOT NULL) WITHOUT ROWID'); }
    return artDb;
  }
  // TVmaze allows about 20 requests every 10 seconds per address; stay under it.
  // Title pages go first, so catalog artwork queued in the background never delays opening a series.
  const queues={high:[],low:[]};let pumping=false;
  function pump() {
    if (pumping) return; pumping=true;
    const next=()=>{
      const turn=queues.high.shift() ?? queues.low.shift();
      if (!turn) { pumping=false; return; }
      const wait=Math.max(0,lastRequest+550-now());
      setTimeout(()=>{lastRequest=now();turn();next();},wait);
    };
    next();
  }
  // A ticket waits in its queue; promoting moves a queued background lookup ahead when a title page needs it.
  function promote(ticket) {
    const index=queues.low.indexOf(ticket.turn);
    if (index >= 0) { queues.low.splice(index,1); queues.high.push(ticket.turn); }
  }
  async function tvmaze(pathname, priority='low', ticket={}) {
    if (closed) throw new Error('Title index is closed.');
    await new Promise(resolve=>{ticket.turn=resolve;queues[priority].push(resolve);pump();});
    const response=await fetchImpl(`${tvmazeApi}${pathname}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status}.`);
    return response.json();
  }
  function seriesArt(imdb, priority='low') {
    const cached=cachedArt(imdb);
    if (cached) return Promise.resolve(cached.value);
    const pending=artPending.get(imdb);
    if (pending) { if (priority === 'high' && pending.ticket) promote(pending.ticket); return pending.promise; }
    const ticket={};
    const promise=tvmaze(`/lookup/shows?imdb=${imdb}`,priority,ticket).then(show=>{
      const value=show && Number.isSafeInteger(show.id) ? {tvmaze:show.id,poster:image(show.image?.original ?? show.image?.medium),description:plainText(show.summary)} : undefined;
      saveArt(imdb,value,7);return value;
    }).finally(()=>artPending.delete(imdb));
    artPending.set(imdb,{promise,ticket});
    return promise;
  }
  function cachedArt(imdb) {
    const cached=artCache().prepare('SELECT value,expires FROM art WHERE imdb=?').get(imdb);
    return cached && cached.expires > now() ? {value:cached.value ? JSON.parse(cached.value) : undefined} : undefined;
  }
  function saveArt(imdb, value, missingDays) {
    if (!closed) artCache().prepare('INSERT OR REPLACE INTO art VALUES(?,?,?)').run(imdb,value ? JSON.stringify(value) : null,now()+(value ? 30 : missingDays)*24*60*60*1000);
  }
  async function wiki(url) {
    const response=await fetchImpl(url,{headers:{...wikiHeaders,Accept:'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
    if (!response.ok) throw new Error(`Wikimedia returned HTTP ${response.status}.`);
    return response.json();
  }
  // Two requests per batch of up to 50 movies: Wikidata maps IMDb IDs to English Wikipedia articles,
  // and Wikipedia returns each article's lead image, which for films is normally the release poster.
  async function lookupMovies(ids) {
    const query=`SELECT ?imdb ?article WHERE { VALUES ?imdb { ${ids.map(id=>`"${id}"`).join(' ')} } ?item wdt:P345 ?imdb. ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }`;
    const sparql=new URL(wikidataSparql);sparql.searchParams.set('query',query);sparql.searchParams.set('format','json');
    const bindings=(await wiki(sparql)).results?.bindings;
    if (!Array.isArray(bindings)) throw new Error('Wikidata returned an invalid response.');
    const articles=new Map();
    for (const b of bindings) { const title=articleTitle(b?.article?.value); if (title && ids.includes(b?.imdb?.value) && !articles.has(b.imdb.value)) articles.set(b.imdb.value,title); }
    const posters=new Map();
    if (articles.size) {
      const api=new URL(wikipediaApi);
      for (const [key,value] of Object.entries({action:'query',format:'json',formatversion:'2',prop:'pageimages',piprop:'thumbnail',pithumbsize:'500',pilicense:'any',redirects:'1',titles:[...new Set(articles.values())].join('|')})) api.searchParams.set(key,value);
      const result=(await wiki(api)).query ?? {};
      const renamed=new Map([...(result.normalized ?? []),...(result.redirects ?? [])].map(r=>[r.from,r.to]));
      for (const page of result.pages ?? []) if (typeof page?.title === 'string') posters.set(page.title,wikiImage(page.thumbnail?.source));
      for (const [id,title] of articles) { let current=title; for (let i=0;i<3&&renamed.has(current);i++) current=renamed.get(current); articles.set(id,{wiki:current,poster:posters.get(current)}); }
    }
    return new Map(ids.map(id=>[id,articles.get(id)]));
  }
  // Cached, deduplicated movie artwork. Titles without an article are retried after three days, as new films gain pages quickly.
  async function movieArt(ids) {
    const result=new Map(),missing=[];
    for (const id of ids) { const cached=cachedArt(id); if (cached) result.set(id,cached.value); else if (!artPending.has(id)) missing.push(id); }
    if (missing.length) {
      const batch=lookupMovies(missing).then(found=>{for (const [id,value] of found) saveArt(id,value,3);return found;});
      for (const id of missing) artPending.set(id,{promise:batch.then(found=>found.get(id)).finally(()=>artPending.delete(id))});
    }
    await Promise.all(ids.filter(id=>!result.has(id)).map(id=>artPending.get(id)?.promise.then(value=>result.set(id,value),()=>{})));
    return result;
  }
  async function movieSummary(id, art) {
    if (!art?.wiki || art.description !== undefined) return art;
    const api=new URL(wikipediaApi);
    for (const [key,value] of Object.entries({action:'query',format:'json',formatversion:'2',prop:'extracts',exintro:'1',explaintext:'1',exsentences:'4',redirects:'1',titles:art.wiki})) api.searchParams.set(key,value);
    const extract=(await wiki(api)).query?.pages?.[0]?.extract;
    const updated={...art,description:typeof extract === 'string' && extract.trim() ? extract.trim() : ''};
    saveArt(id,updated,3);return updated;
  }
  async function open() {
    if (db) return db;
    try { await stat(file); db=new DatabaseSync(file,{readOnly:true}); return db; } catch { return undefined; }
  }
  function refresh() {
    building??=(async()=>{
      await mkdir(dir,{recursive:true});
      const temp=`${file}.${process.pid}.${Date.now()}.tmp`;
      try {
        await buildIndex(temp,{fetchImpl,signal:controller.signal,onStep:step=>{status={state:'building',step};}});
        db?.close();db=undefined;
        await rename(temp,file);
        status={state:'ready'};
      } catch (error) { status={state:'error',error:error.message}; await rm(temp,{force:true}); }
      finally { building=undefined; }
    })();
    return building;
  }
  async function ready() {
    if (closed) throw new Error('Title index is closed.');
    const current=await open();
    if (current) {
      const built=Number(current.prepare('SELECT value FROM info WHERE key=?').get('builtAt')?.value);
      if (!(now()-built < REFRESH_MS)) void refresh();
      return current;
    }
    void refresh();
    const error=new Error(status.state === 'error'
      ? `Hasimio could not build its title index: ${status.error}`
      : `Building Hasimio’s title index for the first time (${status.step ?? 'starting'}, about 250 MB of IMDb data). Catalogs appear in a few minutes.`);
    error.status=503;throw error;
  }
  async function withArt(metas, budgetMs, priority) {
    // Artwork that misses the time budget keeps loading in the background for the next visit.
    const lookups=metas.filter(m=>m.type === 'series').map(m=>seriesArt(m.id,priority).then(value=>{m.poster=value?.poster;m.description=value?.description;}).catch(()=>{}));
    const movies=metas.filter(m=>m.type === 'movie');
    if (movies.length) lookups.push(movieArt(movies.map(m=>m.id)).then(found=>{for (const m of movies) m.poster=found.get(m.id)?.poster;}).catch(()=>{}));
    await Promise.race([Promise.all(lookups),new Promise(resolve=>setTimeout(resolve,budgetMs).unref?.())]);
    return metas.map(m=>Object.fromEntries(Object.entries(m).filter(([,v])=>v !== undefined)));
  }
  async function catalog(type, id, extras={}) {
    const index=await ready();
    const skip=Math.max(0,Number(extras.skip)||0),query=normalize(extras.search ?? '');
    let found;
    if (query) {
      // Ignore punctuation/spacing differences, including old indexes storing “Grey's” as “grey s”.
      // Match all query words independently so “anatomy grey” works too.
      const words=normalize(String(extras.search).replace(/['’]/g,'')).split(' ').filter(Boolean).slice(0,12);
      const clauses=words.map(()=>"instr(replace(search,' ',''),?)>0").join(' AND ');
      // Most popular first. Titles whose words start with the query words rank above mid-word
      // matches, so short queries like “it” still find It before Spirited Away.
      const wordStarts=words.map(()=>"instr(' '||search,' '||?)>0").join(' AND ');
      found=index.prepare(`SELECT * FROM titles WHERE type=? AND ${clauses} ORDER BY (replace(search,' ','')=?) DESC,(${wordStarts}) DESC,votes DESC LIMIT ? OFFSET ?`).all(type,...words,words.join(''),...words,PAGE,skip);
    }
    else if (id === 'popular') found=index.prepare('SELECT * FROM titles WHERE type=? AND start>=? ORDER BY votes DESC LIMIT ? OFFSET ?').all(type,new Date(now()).getFullYear()-2,PAGE,skip);
    else if (id === 'top-rated') found=index.prepare('SELECT * FROM titles WHERE type=? AND votes>=25000 ORDER BY rating DESC,votes DESC LIMIT ? OFFSET ?').all(type,PAGE,skip);
    else throw Object.assign(new Error('Unknown Hasimio catalog.'),{status:404});
    return {metas:await withArt(found.map(row=>titleMeta(row)),3000,query ? 'high' : 'low'),hasMore:found.length === PAGE};
  }
  async function title(id) {
    if (!/^tt\d+$/.test(id)) throw Object.assign(new Error('Invalid IMDb title ID.'),{status:400});
    const row=(await ready()).prepare('SELECT * FROM titles WHERE id=?').get(id);
    if (!row) throw Object.assign(new Error('This title is not in Hasimio’s index.'),{status:404});
    return row;
  }
  async function meta(type, id) {
    const row=await title(id);
    if (row.type !== type) throw Object.assign(new Error('This title is not in Hasimio’s index.'),{status:404});
    if (type === 'movie') {
      let art=await movieArt([id]).then(found=>found.get(id)).catch(()=>undefined);
      art=await movieSummary(id,art).catch(()=>art);
      return {meta:titleMeta(row,art && {...art,description:art.description || undefined})};
    }
    const cached=seriesMetadata.get(id);
    if(cached&&cached.expires>now())return cached.value;
    const fallback=(await ready()).prepare('SELECT * FROM episodes WHERE parent=? ORDER BY season,episode').all(id).map(e=>({id:`${id}:${e.season}:${e.episode}`,season:e.season,episode:e.episode,title:e.name ?? undefined,...(e.runtime>0?{runtime:e.runtime}:{})}));
    let pending=seriesPending.get(id);
    if(!pending){
      pending=(async()=>{
        const info=await seriesArt(id,'high');
        const episodes=info?tvmazeEpisodes(id,await tvmaze(`/shows/${info.tvmaze}/episodes`,'high')):[];
        const value={meta:{...titleMeta(row,info),videos:episodes.length?episodes:fallback}};
        seriesMetadata.delete(id);seriesMetadata.set(id,{value,expires:now()+60*60*1000});
        if(seriesMetadata.size>100)seriesMetadata.delete(seriesMetadata.keys().next().value);
        return value;
      })().catch(()=>({meta:{...titleMeta(row,cachedArt(id)?.value),videos:fallback,metadataPartial:true}})).finally(()=>seriesPending.delete(id));
      seriesPending.set(id,pending);
    }
    // Episode IDs are already in IMDb. Slow optional enrichment must not block
    // selecting an episode and starting source searches; keep enriching for the next refresh.
    if(!fallback.length)return pending;
    let timer;
    try{return await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve({meta:{...titleMeta(row,cachedArt(id)?.value),videos:fallback,metadataPartial:true}}),1200);})]);}
    finally{clearTimeout(timer);}
  }
  async function close() { closed=true; controller.abort(); await building?.catch(()=>{});
    // Release queued lookups at once; their requests fail on the aborted signal instead of waiting their turn.
    for (const turn of [...queues.high.splice(0),...queues.low.splice(0)]) turn();
    await Promise.allSettled([...artPending.values()].map(pending=>pending.promise).concat([...seriesPending.values()])); db?.close(); db=undefined; artDb?.close(); artDb=undefined; }
  return {catalog,meta,title,peopleRows:async()=> (await ready()).prepare('SELECT * FROM titles').all(),status:()=>status,refresh,close};
}
