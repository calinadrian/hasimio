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
export function animeMeta(record) {
  const a = record?.attributes;
  if (record?.type !== 'anime' || !/^\d+$/.test(record?.id ?? '') || !a || typeof a.canonicalTitle !== 'string') throw new Error('Kitsu returned invalid anime data.');
  return {id:`kitsu:${record.id}`,type:a.subtype === 'movie' ? 'movie' : 'series',category:'anime',name:a.canonicalTitle,
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
  const records = catalog === 'kitsu-anime-list' ? [...result.data].sort((a,b) => Number(named(b))-Number(named(a)) || (named(a) ? rank(a)-rank(b) : 0)) : result.data;
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
    if (!page.links?.next) return {...meta,videos:[...videos.values()].sort((a,b)=>a.episode-b.episode)};
    if (!page.data.length) throw new Error('Kitsu returned inconsistent episode pagination.');
  }
  throw new Error('Kitsu episode pagination exceeded the safety limit.');
}
