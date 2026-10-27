import { engineBase } from './engine';
export type Video = { id: string; title?: string; name?: string; season?: number; episode?: number; released?: string; thumbnail?: string };
export type Meta = { id: string; type: string; name: string; poster?: string; background?: string; description?: string; releaseInfo?: string; released?: string; imdbRating?: string; genres?: string[]; runtime?: string; videos?: Video[]; category?: 'anime'; sourceUrl?: string; metadataFetchedAt?: number; metadataError?: string };
export type Resource = string | { name: string; types?: string[]; idPrefixes?: string[] };
export type Manifest = { id: string; name: string; version: string; description: string; resources: Resource[]; types: string[]; idPrefixes?: string[]; catalogs: { id: string; type: string; name?: string; extra?: { name: string; isRequired?: boolean }[] }[] };
export type Addon = { url: string; manifest: Manifest; enabled: boolean; builtin?: boolean };
export type Stream = { subtitleTrack?: {url:string;label:string;language:string}; name?: string; title?: string; url?: string; externalUrl?: string; infoHash?: string; ytId?: string; provider?: string;quality?:string;seeders?:number;sizeBytes?:number;codec?:string;filename?:string };
export const cinemetaUrl = 'https://v3-cinemeta.strem.io/manifest.json';
export const kitsuUrl = 'https://anime-kitsu.strem.fun/manifest.json';
export function manifestUrl(input: string) {
  const url = new URL(input.trim().replace(/^stremio:\/\//i, 'https://'));
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an HTTP or HTTPS manifest URL without embedded credentials.');
  if (!url.pathname.endsWith('/manifest.json')) url.pathname = url.pathname.replace(/\/$/, '') + '/manifest.json';
  url.hash = ''; return url.toString();
}
export function validateManifest(value: unknown): Manifest {
  const m = value as Manifest;
  if (!m || typeof m.id !== 'string' || typeof m.name !== 'string' || typeof m.version !== 'string' || !Array.isArray(m.resources) || !m.resources.every(r => typeof r === 'string' || (r && typeof r.name === 'string')) || !Array.isArray(m.types) || !m.types.every(t => typeof t === 'string')) throw new Error('This URL did not return a valid Stremio add-on manifest.');
  const catalogs = Array.isArray(m.catalogs) ? m.catalogs.filter(c => typeof c.id === 'string' && typeof c.type === 'string') : [];
  return { ...m, description: typeof m.description === 'string' ? m.description : '', catalogs };
}
export function supports(addon: Addon, resource: string, type: string, id: string) {
  return addon.enabled && addon.manifest.resources.some(r => {
    const entry = typeof r === 'string' ? { name: r } : r;
    const types = entry.types ?? addon.manifest.types;
    const prefixes = entry.idPrefixes ?? addon.manifest.idPrefixes;
    return entry.name === resource && types.includes(type) && (!prefixes?.length || prefixes.some(p => id.startsWith(p)));
  });
}
export function resourceUrl(base: string, resource: string, type: string, id: string, extras?: Record<string,string>) {
  // Relative add-on URLs are served by Hasimio Engine (the built-in Pirate Bay source).
  const url = new URL(base,engineBase()); url.pathname = url.pathname.replace(/\/manifest.json$/, '') + `/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}` + (extras && Object.keys(extras).length ? '/' + new URLSearchParams(extras).toString().replace(/\+/g,'%20') : '') + '.json'; return url.toString();
}
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(15000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  return response.json();
}
export const demo: Meta[] = [
  { id: 'tt1160419', type: 'movie', name: 'Dune', releaseInfo: '2021', imdbRating: '8.0', genres: ['Science Fiction', 'Adventure'], description: 'Paul Atreides journeys to the most dangerous planet in the universe to secure the future of his family and his people.', background: 'https://images.metahub.space/background/medium/tt1160419/img' },
  { id: 'tt11198330', type: 'series', name: 'House of the Dragon', releaseInfo: '2022–', genres: ['Fantasy', 'Drama'] },
  { id: 'tt11280740', type: 'series', name: 'Severance', releaseInfo: '2022–', genres: ['Drama', 'Science Fiction'] },
  { id: 'tt13443470', type: 'series', name: 'Wednesday', releaseInfo: '2022–', genres: ['Fantasy', 'Mystery'] },
  { id: 'tt1312171', type: 'series', name: 'The Umbrella Academy', releaseInfo: '2019–2024', genres: ['Action', 'Fantasy'] },
  { id: 'tt4574334', type: 'series', name: 'Stranger Things', releaseInfo: '2016–', genres: ['Drama', 'Science Fiction'] },
  { id: 'tt10872600', type: 'movie', name: 'Spider-Man: No Way Home', releaseInfo: '2021', genres: ['Action', 'Adventure'] },
  { id: 'tt1375666', type: 'movie', name: 'Inception', releaseInfo: '2010', genres: ['Science Fiction', 'Thriller'] },
  { id: 'tt0816692', type: 'movie', name: 'Interstellar', releaseInfo: '2014', genres: ['Science Fiction', 'Drama'] },
  { id: 'tt0903747', type: 'series', name: 'Breaking Bad', releaseInfo: '2008–2013', genres: ['Crime', 'Drama'] },
].map(m => ({ ...m, poster: `https://images.metahub.space/poster/medium/${m.id}/img` }));
export const openFilms: Meta[] = [
  { id: 'open:bbb', type: 'movie', name: 'Big Buck Bunny', releaseInfo: '2008', runtime: '10 min', genres: ['Animation'], poster: 'https://peach.blender.org/wp-content/uploads/title_anouncement.jpg', description: 'A gentle giant takes on a trio of mischievous woodland creatures. An open film by the Blender Foundation, licensed CC BY 3.0.' },
  { id: 'open:steel', type: 'movie', name: 'Tears of Steel', releaseInfo: '2012', runtime: '12 min', genres: ['Science Fiction'], poster: 'https://mango.blender.org/wp-content/uploads/2013/05/01_thom_celia_bridge.jpg', description: 'A group of warriors and scientists gathers in Amsterdam to save the world. An open film by the Blender Foundation, licensed CC BY 3.0.' }
];
export const demoAddon: Addon = { url: 'builtin:open-cinema', enabled: true, builtin: true, manifest: { id: 'org.hasimio.open', name: 'Open Cinema', version: '1.0.0', description: 'Two Creative Commons films from the Blender Foundation. Ready to play in your browser.', resources: ['catalog','meta','stream'], types: ['movie'], idPrefixes: ['open:'], catalogs: [{ id: 'open', type: 'movie', name: 'Open Cinema' }] } };
export function demoStreams(id: string): Stream[] { return [{ name: 'Open Cinema · MP4', title: 'Blender Foundation · CC BY 3.0', url: id === 'open:bbb' ? 'https://media.w3.org/2010/05/bunny/movie.mp4' : 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov' }]; }
export function safeHttp(url?: string) { if (!url) return undefined; try { const parsed = new URL(url); return ['https:','http:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; } }
export function datedVideos(meta: Meta): Video[] {
  const videos = meta.type === 'movie' && validRelease(meta.released)
    ? [{id:meta.id,title:'Movie release',released:meta.released}]
    : meta.videos ?? [];
  return [...new Map(videos.filter(v => typeof v.id === 'string' && validRelease(v.released)).map(v => [v.id,v])).values()];
}
export function validRelease(value?: string): boolean {
  // A year alone is not a release date. Never invent January 1 for unknown dates.
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value) && Number.isFinite(Date.parse(value));
}
export function calendarEvents(library: Meta[], month: Date) {
  return library.flatMap(meta => datedVideos(meta).filter(v => {
    const date = new Date(v.released!); return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
  }).map(video => ({ meta, video, day: new Date(video.released!).getDate() }))).sort((a,b) => Date.parse(a.video.released!) - Date.parse(b.video.released!));
}
export function nextRelease(meta: Meta, now = Date.now()) {
  return datedVideos(meta).filter(v => Date.parse(v.released!) >= now).sort((a,b) => Date.parse(a.released!) - Date.parse(b.released!))[0];
}
export function episodeLabel(meta: Meta, video: Video) {
  if (meta.type === 'movie') return 'Movie release';
  return `${video.season != null ? `S${video.season} · ` : ''}${video.episode != null ? `E${video.episode}` : 'Episode'}`;
}

