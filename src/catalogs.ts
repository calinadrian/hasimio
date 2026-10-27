import { type Addon, type Meta, type Manifest, cinemetaUrl, kitsuUrl, demoAddon, getJson, resourceUrl, supports } from './media';

// Minimal declarations for the public resources verified against the providers' manifests.
const searchAndSkip = [{name:'search'},{name:'skip'}];
export const cinemeta: Addon = {url:cinemetaUrl,enabled:true,manifest:{id:'com.linvo.cinemeta',name:'Cinemeta',version:'3.0.14',description:'Movie and series catalogs, artwork, descriptions, and episode release dates.',types:['movie','series'],idPrefixes:['tt'],resources:['catalog','meta'],catalogs:[{id:'top',type:'movie',name:'Popular movies',extra:searchAndSkip},{id:'top',type:'series',name:'Popular series',extra:searchAndSkip},{id:'imdbRating',type:'movie',name:'Top-rated movies',extra:[{name:'skip'}]},{id:'imdbRating',type:'series',name:'Top-rated series',extra:[{name:'skip'}]}]}};
export const kitsu: Addon = {url:kitsuUrl,enabled:true,manifest:{id:'community.anime.kitsu',name:'Anime Kitsu',version:'0.0.10',description:'Anime catalogs, artwork, metadata, and available episode schedules from Kitsu.',types:['anime','movie','series'],idPrefixes:['kitsu','mal','anilist','anidb'],resources:['catalog','meta','subtitles'],catalogs:[{id:'kitsu-anime-trending',type:'anime',name:'Trending anime'},{id:'kitsu-anime-airing',type:'anime',name:'Airing anime',extra:[{name:'skip'}]},{id:'kitsu-anime-popular',type:'anime',name:'Popular anime',extra:[{name:'skip'}]},{id:'kitsu-anime-rating',type:'anime',name:'Top-rated anime',extra:[{name:'skip'}]},{id:'kitsu-anime-list',type:'anime',name:'Anime search',extra:[{name:'search',isRequired:true},{name:'skip'}]}]}};
export const pirateBay:Addon={url:'/api/extensions/piratebay/manifest.json',enabled:true,manifest:{id:'org.hasimio.piratebay',name:'The Pirate Bay',version:'1.0.0',description:'Torrent sources from The Pirate Bay index via APIBay. Streams through Hasimio’s local torrent service.',resources:['stream'],types:['movie','series'],idPrefixes:['tt'],catalogs:[]}};
export const defaultAddons = [demoAddon,cinemeta,kitsu,pirateBay];
export function addDefaultCatalogs(existing: Addon[]) {
  return [...existing,...[cinemeta,kitsu].filter(source => !existing.some(a => a.manifest.id === source.manifest.id || a.url === source.url))];
}
export type CatalogRow = {key:string;title:string;source:string;items:Meta[];addon:Addon;catalog:Manifest['catalogs'][number];skip:number;hasMore:boolean};
export function catalogSelection(addons: Addon[], query: string, filter: string) {
  return addons.filter(a => a.enabled && !a.builtin).flatMap(addon => addon.manifest.catalogs.filter(c => {
    const anime = c.type === 'anime' || addon.manifest.id === kitsu.manifest.id;
    if (filter === 'Anime' && !anime) return false;
    if (filter === 'Movies' && c.type !== 'movie') return false;
    if (filter === 'Series' && c.type !== 'series') return false;
    if (query && !c.extra?.some(e => e.name === 'search')) return false;
    return !c.extra?.some(e => e.isRequired && (e.name !== 'search' || !query));
  }).slice(0,6).map(catalog => ({addon,catalog})));
}
export async function loadCatalog(addon:Addon, catalog:Manifest['catalogs'][number], query:string, skip = 0, signal?:AbortSignal): Promise<CatalogRow> {
  const extras:Record<string,string> = {};
  if (query) extras.search = query;
  if (skip) extras.skip = String(skip);
  const result = await getJson<{metas:Meta[]}>(resourceUrl(addon.url,'catalog',catalog.type,catalog.id,extras),signal);
  if (!Array.isArray(result.metas)) throw new Error(`${addon.manifest.name} returned an invalid catalog.`);
  const anime = catalog.type === 'anime' || addon.manifest.id === kitsu.manifest.id;
  const items = result.metas.filter(m => m && typeof m.id === 'string' && typeof m.name === 'string').map(m => ({...m,type:m.type || catalog.type,category:anime ? 'anime' as const : m.category,sourceUrl:addon.url}));
  const label = anime ? 'Anime' : catalog.type === 'series' ? 'Series' : catalog.type === 'movie' ? 'Movies' : catalog.type;
  const title = catalog.name ? /movie|series|anime/i.test(catalog.name) ? catalog.name : `${catalog.name} · ${label}` : `${addon.manifest.name} · ${label}`;
  return {key:`${addon.manifest.id}:${catalog.type}:${catalog.id}`,title,source:addon.manifest.name,items,addon,catalog,skip:skip+result.metas.length,hasMore:items.length > 0 && !!catalog.extra?.some(e => e.name === 'skip')};
}
export function needsMetadata(meta:Meta, now = Date.now()) {
  return !meta.metadataFetchedAt || now - meta.metadataFetchedAt >= (meta.metadataError ? 10*60*1000 : 6*60*60*1000);
}
export async function loadMetadata(meta:Meta, addons:Addon[], signal?:AbortSignal): Promise<Meta> {
  if (meta.id.startsWith('open:')) return {...meta,metadataFetchedAt:Date.now(),metadataError:undefined};
  const sources = addons.filter(a => !a.builtin && supports(a,'meta',meta.type,meta.id)).sort((a,b) => Number(b.url === meta.sourceUrl)-Number(a.url === meta.sourceUrl));
  for (const source of sources) {
    try {
      const result = await getJson<{meta:Meta}>(resourceUrl(source.url,'meta',meta.type,meta.id),signal);
      if (!result.meta || typeof result.meta.id !== 'string' || typeof result.meta.name !== 'string') continue;
      return {...meta,...result.meta,id:meta.id,type:meta.type,category:meta.category ?? (source.manifest.id === kitsu.manifest.id ? 'anime' : undefined),sourceUrl:source.url,videos:Array.isArray(result.meta.videos) ? result.meta.videos : meta.videos,metadataFetchedAt:Date.now(),metadataError:undefined};
    } catch { if (signal?.aborted) throw new DOMException('Aborted','AbortError'); }
  }
  return {...meta,metadataFetchedAt:Date.now(),metadataError:sources.length ? 'Release information could not be updated. Retry refresh.' : 'Enable a matching metadata extension to load release dates.'};
}
