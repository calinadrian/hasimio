// Hasimio's own adapter. Only data from Kitsu's API is consumed; no add-on code.
export const kitsuApi = 'https://kitsu.io/api/edge';
const text = value => typeof value === 'string' ? value : undefined;
const positive = value => Number.isSafeInteger(value) && value > 0;
function image(value) {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
function date(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? value : undefined; }
async function request(path, params, signal, fetchImpl) {
  const url = new URL(`${kitsuApi}/${path}`);
  for (const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
  const timeout = AbortSignal.timeout(15000);
  const response = await fetchImpl(url, {headers:{Accept:'application/vnd.api+json'},credentials:'omit',redirect:'error',signal:signal ? AbortSignal.any([signal,timeout]) : timeout});
  if (!response.ok) throw new Error(`Kitsu returned HTTP ${response.status}.`);
  return response.json();
}
// Kitsu lists every season as its own anime. These suffixes separate the series name from the season,
// peeled from the end so "Season 3 Part 2" yields both. Arc separators must be explicit: an arc name
// never swallows an earlier " - " or ":" that belongs to the series name.
const titleGap = String.raw`(?:\s+-\s+|\s*[:~–—]\s*|\s+)`;
const arcGap = String.raw`(?:\s+-\s+|\s*[:~–—]\s*)`;
const arcName = String.raw`(?:(?!\s-\s)[^:~–—])+?`;
const seasonWords = {first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10};
const seasonNumerals = {II:2,III:3,IV:4,V:5,VI:6};
const marker = (source,label,flags='i') => [new RegExp(`${source}$`,flags),label];
const seasonMarkers = [
  marker(`${titleGap}(?:the\\s+)?final\\s+season`,()=>'Final Season'),
  marker(`${titleGap}season\\s*(\\d{1,2})`,m=>`Season ${Number(m[1])}`),
  marker(`${titleGap}(\\d{1,2})(?:st|nd|rd|th)\\s+season`,m=>`Season ${Number(m[1])}`),
  marker(`${titleGap}(${Object.keys(seasonWords).join('|')})\\s+season`,m=>`Season ${seasonWords[m[1].toLowerCase()]}`),
  marker(`${titleGap}(?:part|cour)\\s*(\\d{1,2})`,m=>`Part ${Number(m[1])}`),
  marker(`${titleGap}final\\s+chapters?`,()=>'Final Chapters'),
  marker(`${arcGap}(${arcName}\\s+arc)`,m=>m[1]),
  marker(`${arcGap}(${arcName}[\\s-]hen)`,m=>m[1]),
  // Bare numbers stay small so Area 88 and Mob Psycho 100 keep their names.
  marker(String.raw`\s+([2-9])`,m=>`Season ${m[1]}`),
  // "Lupin III" is a name, not a third season.
  marker(`\\s+(${Object.keys(seasonNumerals).join('|')})`,m=>/\blupin\s+\S+$/i.test(m.input) ? undefined : `Season ${seasonNumerals[m[1]]}`,''),
];
export function parseSeasonTitle(title) {
  let base = title.trim();
  const parts = [];
  for (let changed=true;changed;) {
    changed = false;
    for (const [pattern,label] of seasonMarkers) {
      const match = pattern.exec(base);
      const part = match?.index ? label(match) : undefined;
      if (!part) continue;
      parts.unshift(part);
      base = base.slice(0,match.index).trim();
      changed = true;
      break;
    }
  }
  return {base,label:parts.join(' ') || undefined};
}
export const compactTitle = value => value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
const textValue = value => typeof value === 'string' && value.trim() ? value.trim() : undefined;
export function animeMeta(record) {
  const a = record?.attributes;
  if (record?.type !== 'anime' || !/^\d+$/.test(record?.id ?? '') || !a || typeof a.canonicalTitle !== 'string') throw new Error('Kitsu returned invalid anime data.');
  // Kitsu's canonical title is English for some records and romaji for others. Prefer English so a series reads the same everywhere.
  const name = textValue(a.titles?.en) ?? textValue(a.titles?.en_us) ?? a.canonicalTitle;
  // Abbreviations stay out of the series identity: "FMA" names two different series.
  const titles = [a.canonicalTitle,...Object.values(a.titles ?? {})].map(textValue).filter(Boolean);
  const parsed = parseSeasonTitle(name);
  return {id:`kitsu:${record.id}`,type:a.subtype === 'movie' ? 'movie' : 'series',category:'anime',name,originalName:a.canonicalTitle,
    animeFormat:text(a.subtype),seriesName:parsed.base,seasonLabel:parsed.label ?? (titles.some(title=>parseSeasonTitle(title).label) ? name : undefined),
    seriesKeys:[...new Set(titles.map(title=>compactTitle(parseSeasonTitle(title).base)).filter(Boolean))],
    aliases:[...new Set([...Object.values(a.titles ?? {}),...(Array.isArray(a.abbreviatedTitles) ? a.abbreviatedTitles : [])].filter(v=>typeof v === 'string' && v.trim()))],
    poster:image(a.posterImage?.large ?? a.posterImage?.original),background:image(a.coverImage?.large ?? a.coverImage?.original),
    description:text(a.synopsis),releaseInfo:date(a.startDate)?.slice(0,4),released:a.subtype === 'movie' ? date(a.startDate) : undefined,
    runtime:positive(a.episodeLength) ? `${a.episodeLength} min` : undefined};
}
export async function kitsuCatalog(catalog, query='', skip=0, signal, fetchImpl=fetch) {
  const params = {'page[limit]':20,'page[offset]':Math.max(0,skip)};
  let path = 'anime';
  switch (catalog) {
    case 'kitsu-anime-trending': path='trending/anime'; break;
    case 'kitsu-anime-airing': params['filter[status]']='current'; params.sort='popularityRank'; break;
    case 'kitsu-anime-popular': params.sort='popularityRank'; break;
    case 'kitsu-anime-rating': params.sort='ratingRank'; break;
    case 'kitsu-anime-list': params['filter[text]']=query; break;
    default: throw new Error('Unknown Hasimio anime catalog.');
  }
  const result = await request(path,params,signal,fetchImpl);
  if (!Array.isArray(result.data)) throw new Error('Kitsu returned an invalid catalog.');
  // Kitsu's text search is fuzzy. Titles that contain the query come first, most popular first;
  // looser matches keep Kitsu's relevance order after them.
  const rank = record => positive(record?.attributes?.popularityRank) ? record.attributes.popularityRank : Infinity;
  const plain = value => String(value ?? '').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  const wanted = plain(query), named = record => !!wanted && [record?.attributes?.canonicalTitle,...Object.values(record?.attributes?.titles ?? {})].some(title => plain(title).includes(wanted));
  const exact = record => !!wanted && [record?.attributes?.canonicalTitle,...Object.values(record?.attributes?.titles ?? {}),...(record?.attributes?.abbreviatedTitles ?? [])].some(title=>plain(title)===wanted);
  const records = catalog === 'kitsu-anime-list' ? [...result.data].sort((a,b) => Number(exact(b))-Number(exact(a)) || Number(named(b))-Number(named(a)) || (named(a) ? rank(a)-rank(b) : 0)) : result.data;
  return {metas:records.map(animeMeta),hasMore:typeof result.links?.next === 'string'};
}
export async function kitsuMetadata(id, signal, fetchImpl=fetch, episodeNumber) {
  const match = /^kitsu:(\d+)$/.exec(id);
  if (!match) throw new Error('Invalid Kitsu anime ID.');
  const number = match[1];
  const result = await request(`anime/${number}`,{},signal,fetchImpl);
  const meta = animeMeta(result.data);
  if (meta.id !== id) throw new Error('Kitsu returned a different anime.');
  if (meta.type === 'movie') return meta;
  return {...meta,videos:await episodes(id,number,signal,fetchImpl,episodeNumber)};
}
async function episodes(id, number, signal, fetchImpl, episodeNumber) {
  const videos = new Map();
  for (let offset=0;offset<10000;offset+=20) {
    const params = {'page[limit]':20,'page[offset]':offset};
    if (episodeNumber != null) params['filter[number]']=episodeNumber;
    const page = await request(`anime/${number}/episodes`,params,signal,fetchImpl);
    if (!Array.isArray(page.data)) throw new Error('Kitsu returned invalid episodes.');
    for (const record of page.data) {
      const a=record?.attributes;
      if (record?.type !== 'episodes' || !a || !positive(a.number)) throw new Error('Kitsu returned an invalid episode.');
      const video={id:`${id}:${a.number}`,episode:positive(a.relativeNumber) ? a.relativeNumber : a.number,season:positive(a.seasonNumber) ? a.seasonNumber : 1,title:text(a.canonicalTitle),released:date(a.airdate),thumbnail:image(a.thumbnail?.original)};
      videos.set(video.id,video);
    }
    // Never follow URLs supplied by the provider. Build each page on our fixed origin.
    if (!page.links?.next) return [...videos.values()].sort((a,b)=>a.episode-b.episode);
    if (!page.data.length) throw new Error('Kitsu returned inconsistent episode pagination.');
  }
  throw new Error('Kitsu episode pagination exceeded the safety limit.');
}
async function sequelRecords(number, signal, fetchImpl) {
  const page = await request(`anime/${number}/media-relationships`,{'filter[role]':'sequel,prequel',include:'destination','page[limit]':20},signal,fetchImpl);
  if (!Array.isArray(page.data)) throw new Error('Kitsu returned invalid relationships.');
  const wanted = new Set(page.data.filter(link=>['sequel','prequel'].includes(link?.attributes?.role)&&link?.relationships?.destination?.data?.type==='anime').map(link=>link.relationships.destination.data.id));
  return (Array.isArray(page.included) ? page.included : []).filter(record=>record?.type==='anime'&&wanted.has(record.id));
}
const seriesRecordLimit = 40, seriesRequestLimit = 3;
const numberedSubtypes = new Set(['TV','ONA']), specialSubtypes = new Set(['special','OVA']);
const airedOrder = (a,b) => (date(a.attributes.startDate) ?? '9999').localeCompare(date(b.attributes.startDate) ?? '9999') || Number(a.id)-Number(b.id);
// One title for a whole series. Follows sequel links through movies, since Mugen Train sits between two
// TV seasons, but stops at records with an unrelated name, so Naruto and Naruto: Shippuden stay apart.
// Episode IDs still name their own season's record: stream lookups and saved progress keep working.
export async function kitsuSeries(id, signal, fetchImpl=fetch) {
  const match = /^kitsu:(\d+)$/.exec(id);
  if (!match) throw new Error('Invalid Kitsu anime ID.');
  const result = await request(`anime/${match[1]}`,{},signal,fetchImpl);
  const entry = animeMeta(result.data);
  if (entry.id !== id) throw new Error('Kitsu returned a different anime.');
  if (entry.type === 'movie') return entry;
  const records = new Map([[result.data.id,result.data]]), keys = new Set(entry.seriesKeys);
  let partial = false, frontier = [result.data];
  while (frontier.length && records.size < seriesRecordLimit) {
    const pages = await Promise.allSettled(frontier.map(record=>sequelRecords(record.id,signal,fetchImpl)));
    if (signal?.aborted) throw new DOMException('Aborted','AbortError');
    frontier = [];
    for (const page of pages) {
      if (page.status === 'rejected') { partial = true; continue; }
      for (const record of page.value) {
        if (records.has(record.id) || records.size >= seriesRecordLimit) continue;
        let meta;
        try { meta = animeMeta(record); } catch { continue; }
        if (!meta.seriesKeys.some(key=>keys.has(key))) continue;
        records.set(record.id,record);
        meta.seriesKeys.forEach(key=>keys.add(key));
        frontier.push(record);
      }
    }
  }
  const all = [...records.values()];
  const numbered = all.filter(record=>numberedSubtypes.has(record.attributes.subtype)).sort(airedOrder);
  const specials = all.filter(record=>specialSubtypes.has(record.attributes.subtype)).sort(airedOrder);
  const merged = [...numbered,...specials];
  const parts = merged.length > 1 && merged.includes(result.data) ? merged : [result.data];
  const first = animeMeta(numbered[0] && parts.includes(numbered[0]) ? numbered[0] : result.data);
  const loaded = new Map();
  const queue = [...parts];
  await Promise.all(Array.from({length:Math.min(seriesRequestLimit,queue.length)},async()=>{
    while (queue.length) {
      const record = queue.shift();
      try { loaded.set(record.id,await episodes(`kitsu:${record.id}`,record.id,signal,fetchImpl)); }
      catch (error) { if (signal?.aborted) throw error; loaded.set(record.id,error); partial = true; }
    }
  }));
  const failure = parts.map(record=>loaded.get(record.id)).find(value=>value instanceof Error);
  if (failure && parts.every(record=>loaded.get(record.id) instanceof Error)) throw failure;
  const videosOf = record => { const value = loaded.get(record.id); return value instanceof Error ? [] : value; };
  // A standalone special keeps its full name; the series name alone would say nothing about it.
  const identity = {...first,name:numberedSubtypes.has(first.animeFormat) ? first.seriesName : first.name,seasonLabel:undefined,seriesKeys:[...keys],seasonIds:parts.map(record=>`kitsu:${record.id}`),...(partial ? {metadataPartial:true} : {})};
  if (parts.length === 1) return {...identity,videos:videosOf(parts[0])};
  const seasons = numbered.filter(record=>videosOf(record).length);
  const seasonName = (record,season) => {
    const meta = animeMeta(record);
    // A later entry with no season words, such as a director's cut, keeps its title rather than taking the next number.
    const label = meta.seasonLabel ?? (season > 1 && compactTitle(meta.name) !== compactTitle(first.seriesName) ? meta.name : undefined);
    if (!label || label === `Season ${season}`) return undefined;
    // A title with no season words in English falls back to its full name, minus the series.
    return label.startsWith(first.seriesName) ? label.slice(first.seriesName.length).replace(/^[\s:~–—-]+/,'') || undefined : label;
  };
  const videos = seasons.flatMap((record,index)=>{
    const name = seasonName(record,index+1);
    return videosOf(record).map(video=>({...video,season:index+1,...(name ? {seasonName:name} : {})}));
  });
  // Specials come from several records, so they are numbered as one list. The title of a
  // one-episode special is the only name that episode has.
  let special = 0;
  for (const record of specials) {
    const list = videosOf(record);
    for (const video of list) videos.push({...video,season:0,episode:++special,title:video.title ?? (list.length === 1 ? animeMeta(record).name : undefined)});
  }
  return {...identity,videos};
}
