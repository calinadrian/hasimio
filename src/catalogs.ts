import {stremioSources,stremioManifests} from '../shared/stremio-sources.mjs';
import {kitsuCatalog,kitsuMetadata} from '../shared/kitsu.mjs';
import {torrentClawManifest} from '../shared/torrentclaw-manifest.mjs';
import { type Addon, type Meta, type Manifest, cinemetaUrl, kitsuUrl, titlesUrl, demoAddon, getJson, resourceUrl, supports } from './media';

// Hasimio owns its catalogs: anime through its Kitsu adapter, movies and series through its own title index.
// Cinemeta stays recognised so existing installations migrate, and it can still be installed manually.
const searchAndSkip = [{name:'search'},{name:'skip'}];
export const cinemeta: Addon = {url:cinemetaUrl,enabled:true,manifest:{id:'com.linvo.cinemeta',name:'Cinemeta',version:'3.0.14',description:'Movie and series catalogs, artwork, descriptions, and episode release dates.',types:['movie','series'],idPrefixes:['tt'],resources:['catalog','meta'],catalogs:[{id:'top',type:'movie',name:'Popular movies',extra:searchAndSkip},{id:'top',type:'series',name:'Popular series',extra:searchAndSkip},{id:'imdbRating',type:'movie',name:'Top-rated movies',extra:[{name:'skip'}]},{id:'imdbRating',type:'series',name:'Top-rated series',extra:[{name:'skip'}]}]}};
export const titles: Addon = {url:titlesUrl,enabled:true,manifest:{id:'org.hasimio.titles',name:'Hasimio Titles',version:'1.0.0',description:'Hasimio’s own movie and series index, built locally from IMDb’s public datasets. Wikipedia adds movie posters; TVmaze adds series artwork and episode air dates.',types:['movie','series'],idPrefixes:['tt'],resources:['catalog','meta'],catalogs:[{id:'popular',type:'movie',name:'Popular movies',extra:searchAndSkip},{id:'popular',type:'series',name:'Popular series',extra:searchAndSkip},{id:'top-rated',type:'movie',name:'Top-rated movies',extra:[{name:'skip'}]},{id:'top-rated',type:'series',name:'Top-rated series',extra:[{name:'skip'}]}]}};
// Runs once: Cinemeta becomes Hasimio Titles, keeping its enabled state. Installations without either receive Hasimio Titles.
export function replaceCinemeta(existing:Addon[]) {
  const replaced = existing.map(a => a.url === cinemetaUrl ? {...titles,enabled:a.enabled} : a).filter((a,index,all) => all.findIndex(other => other.manifest.id === a.manifest.id) === index);
  return replaced.some(a => a.manifest.id === titles.manifest.id) ? replaced : [...replaced,titles];
}
export const kitsu: Addon = {url:kitsuUrl,enabled:true,manifest:{id:'org.hasimio.kitsu',name:'Hasimio Anime',version:'1.0.0',description:'Hasimio’s own anime integration using Kitsu’s data API directly.',types:['anime','movie','series'],idPrefixes:['kitsu:'],resources:['catalog','meta'],catalogs:[{id:'kitsu-anime-trending',type:'anime',name:'Trending anime'},{id:'kitsu-anime-airing',type:'anime',name:'Airing anime',extra:[{name:'skip'}]},{id:'kitsu-anime-popular',type:'anime',name:'Popular anime',extra:[{name:'skip'}]},{id:'kitsu-anime-rating',type:'anime',name:'Top-rated anime',extra:[{name:'skip'}]},{id:'kitsu-anime-list',type:'anime',name:'Anime search',extra:[{name:'search',isRequired:true},{name:'skip'}]}]}};
export const pirateBay:Addon={url:'/api/extensions/piratebay/manifest.json',enabled:true,manifest:{id:'org.hasimio.piratebay',name:'The Pirate Bay',version:'1.1.0',description:'Movie, series and anime torrent sources from The Pirate Bay index via APIBay. Streams through Hasimio’s local torrent service.',resources:['stream'],types:['movie','series','anime'],idPrefixes:['tt','kitsu:'],catalogs:[]}};
export const yts:Addon={url:'/api/extensions/yts/manifest.json',enabled:true,manifest:{id:'org.hasimio.yts',name:'YTS',version:'1.0.0',description:'Alternative movie torrent sources from YTS. Streams through Hasimio’s local torrent service.',resources:['stream'],types:['movie'],idPrefixes:['tt'],catalogs:[]}};
export function addYtsSource(existing:Addon[]) {
  return existing.some(a=>a.manifest.id===yts.manifest.id||a.url===yts.url)?existing:[...existing,yts];
}
export const eztv:Addon={url:'/api/extensions/eztv/manifest.json',enabled:true,manifest:{id:'org.hasimio.eztv',name:'EZTV',version:'1.0.0',description:'Alternative series episode torrent sources from EZTV. Streams through Hasimio’s local torrent service.',resources:['stream'],types:['series'],idPrefixes:['tt'],catalogs:[]}};
export function addEztvSource(existing:Addon[]) {
  return existing.some(a=>a.manifest.id===eztv.manifest.id||a.url===eztv.url)?existing:[...existing,eztv];
}
export const torrentDownloads:Addon={url:'/api/extensions/torrentdownloads/manifest.json',enabled:true,manifest:{id:'org.hasimio.torrentdownloads',name:'TorrentDownloads',version:'1.0.0',description:'Alternative movie and series episode torrent sources from TorrentDownloads. Streams through Hasimio’s local torrent service.',resources:['stream'],types:['movie','series'],idPrefixes:['tt'],catalogs:[]}};
export function addTorrentDownloadsSource(existing:Addon[]) {
  return existing.some(a=>a.manifest.id===torrentDownloads.manifest.id||a.url===torrentDownloads.url)?existing:[...existing,torrentDownloads];
}
// Off by default: TorrentClaw's network refuses some connections (HTTP 403), so users opt in from Extensions.
export const torrentClaw:Addon={url:'/api/extensions/torrentclaw/manifest.json',enabled:false,manifest:torrentClawManifest};
export function addTorrentClawSource(existing:Addon[]) {
  return existing.some(a=>a.manifest.id===torrentClaw.manifest.id||a.url===torrentClaw.url)?existing:[...existing,torrentClaw];
}
export const torrentio:Addon={url:'/api/extensions/torrentio/manifest.json',enabled:stremioSources.torrentio.enabled,manifest:stremioManifests.torrentio};
export const comet:Addon={url:'/api/extensions/comet/manifest.json',enabled:stremioSources.comet.enabled,manifest:stremioManifests.comet};
export function addStremioSource(existing:Addon[],source:Addon) {
  const key=source===torrentio?'torrentio':'comet';
  return existing.some(a=>a.manifest.id===source.manifest.id||a.url===source.url||a.url===stremioSources[key].manifestUrl||a.manifest.id===(key==='torrentio'?'com.stremio.torrentio.addon':'comet.elfhosted.com'))?existing:[...existing,source];
}
export function updatePlaybackAddon(existing:Addon[]) {
  return existing.map(a => a.url === torrentClaw.url && a.manifest.id === torrentClaw.manifest.id && a.manifest.version !== torrentClaw.manifest.version ? {...a,manifest:torrentClaw.manifest} : a.url === pirateBay.url && a.manifest.id === pirateBay.manifest.id && a.manifest.version !== pirateBay.manifest.version ? {...a,manifest:pirateBay.manifest} : a);
}
export function migrateAnimeSource(existing:Addon[]) {
  return existing.map(a => a.manifest.id === 'community.anime.kitsu' || a.manifest.id === kitsu.manifest.id || a.url === 'https://anime-kitsu.strem.fun/manifest.json' ? {...kitsu,enabled:a.enabled} : a)
    .filter((a,index,all) => all.findIndex(other=>other.manifest.id === a.manifest.id) === index);
}
export const defaultAddons = [demoAddon,titles,kitsu,pirateBay,yts,eztv,torrentDownloads,torrentClaw,torrentio,comet];
// Sources served by Hasimio itself. Synced records may use these non-HTTP URLs.
export const builtinSourceUrls = defaultAddons.map(a => a.url).filter(url => !/^https?:/.test(url));
// One-time additions for existing installations, applied in order. A flag is set once, so later removals are preserved.
export const sourceMigrations:[flag:string,apply:(existing:Addon[])=>Addon[]][] = [
  ['hasimio:piratebay-v1',existing => existing.some(a => a.manifest.id === pirateBay.manifest.id) ? existing : [...existing,pirateBay]],
  ['hasimio:yts-v1',addYtsSource],['hasimio:eztv-v1',addEztvSource],['hasimio:torrentdownloads-v1',addTorrentDownloadsSource],
  ['hasimio:torrentclaw-v1',addTorrentClawSource],['hasimio:titles-v1',replaceCinemeta],
  ['hasimio:torrentio-v1',existing=>addStremioSource(existing,torrentio)],['hasimio:comet-v1',existing=>addStremioSource(existing,comet)],
];
export function addDefaultCatalogs(existing: Addon[]) {
  return [...existing,...[titles,kitsu].filter(source => !existing.some(a => a.manifest.id === source.manifest.id || a.url === source.url))];
}
export function removeBundledTitle(existing:Meta[]) {
  return existing.filter(meta=>!(meta.id==='tt28504410'&&meta.type==='series'));
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
  }).map(catalog => ({addon,catalog})));
}
export async function loadCatalog(addon:Addon, catalog:Manifest['catalogs'][number], query:string, skip = 0, signal?:AbortSignal): Promise<CatalogRow> {
  const extras:Record<string,string> = {};
  if (query) extras.search = query;
  if (skip) extras.skip = String(skip);
  const result = addon.manifest.id === kitsu.manifest.id
    ? await kitsuCatalog(catalog.id,query,skip,signal)
    : await getJson<{metas:Meta[];hasMore?:boolean;nextSkip?:number}>(resourceUrl(addon.url,'catalog',catalog.type,catalog.id,extras),signal);
  if (!Array.isArray(result.metas)) throw new Error(`${addon.manifest.name} returned an invalid catalog.`);
  const anime = catalog.type === 'anime' || addon.manifest.id === kitsu.manifest.id;
  const items = result.metas.filter(m => m && typeof m.id === 'string' && typeof m.name === 'string').map(m => ({...m,type:m.type || catalog.type,category:anime ? 'anime' as const : m.category,sourceUrl:addon.url}));
  const label = anime ? 'Anime' : catalog.type === 'series' ? 'Series' : catalog.type === 'movie' ? 'Movies' : catalog.type;
  const title = catalog.name ? /movie|series|anime/i.test(catalog.name) ? catalog.name : `${catalog.name} · ${label}` : `${addon.manifest.name} · ${label}`;
  return {key:`${addon.manifest.id}:${catalog.type}:${catalog.id}`,title,source:addon.manifest.name,items,addon,catalog,skip:'nextSkip' in result && Number.isSafeInteger(result.nextSkip) && Number(result.nextSkip)>skip ? Number(result.nextSkip) : skip+result.metas.length,hasMore:(result.hasMore ?? items.length > 0) && !!catalog.extra?.some(e => e.name === 'skip')};
}
export function needsMetadata(meta:Meta, now = Date.now()) {
  return !meta.metadataFetchedAt || now - meta.metadataFetchedAt >= (meta.metadataError ? 10*60*1000 : 6*60*60*1000);
}
export async function loadMetadata(meta:Meta, addons:Addon[], signal?:AbortSignal): Promise<Meta> {
  if (meta.id.startsWith('open:')) return {...meta,metadataFetchedAt:Date.now(),metadataError:undefined};
  const sources = migrateAnimeSource(addons).filter(a => !a.builtin && supports(a,'meta',meta.type,meta.id)).sort((a,b) => Number(b.url === meta.sourceUrl)-Number(a.url === meta.sourceUrl));
  for (const source of sources) {
    try {
      const result = source.manifest.id === kitsu.manifest.id
        ? {meta:await kitsuMetadata(meta.id,signal)}
        : await getJson<{meta:Meta}>(resourceUrl(source.url,'meta',meta.type,meta.id),signal);
      if (!result.meta || typeof result.meta.id !== 'string' || typeof result.meta.name !== 'string') continue;
      return {...meta,...result.meta,id:meta.id,type:meta.type,category:meta.category ?? (source.manifest.id === kitsu.manifest.id ? 'anime' : undefined),sourceUrl:source.url,videos:Array.isArray(result.meta.videos) ? result.meta.videos : meta.videos,metadataFetchedAt:Date.now(),metadataError:undefined};
    } catch { if (signal?.aborted) throw new DOMException('Aborted','AbortError'); }
  }
  return {...meta,metadataFetchedAt:Date.now(),metadataError:sources.length ? 'Release information could not be updated. Retry refresh.' : 'Enable a matching metadata extension to load release dates.'};
}
