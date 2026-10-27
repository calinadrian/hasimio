import { type Addon, type Meta, validateManifest } from './media';

// Libraries live in each site's own storage, so moving between a LAN copy and a hosted copy goes through a file.
export const LIBRARY_FORMAT = 'hasimio-library';
export type LibraryFile = { format: typeof LIBRARY_FORMAT; version: 1; exportedAt: string; library: Meta[]; addons: Addon[] };
export function exportLibrary(library: Meta[], addons: Addon[], now = new Date()): LibraryFile {
  return { format: LIBRARY_FORMAT, version: 1, exportedAt: now.toISOString(), library, addons: addons.filter(a => !a.builtin) };
}
function addonUrl(url: unknown) {
  if (typeof url !== 'string') return false;
  if (url.startsWith('/api/')) return true;
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; }
}
export function parseLibrary(text: string) {
  let data: Partial<LibraryFile>;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not a Hasimio library export.'); }
  if (!data || data.format !== LIBRARY_FORMAT || data.version !== 1 || !Array.isArray(data.library)) throw new Error('This file is not a Hasimio library export.');
  const library = data.library.filter((m): m is Meta => Boolean(m) && typeof m.id === 'string' && typeof m.type === 'string' && typeof m.name === 'string');
  const addons = (Array.isArray(data.addons) ? data.addons : []).flatMap(a => {
    if (!a || a.builtin || !addonUrl(a.url)) return [];
    try { return [{ url: a.url, manifest: validateManifest(a.manifest), enabled: a.enabled !== false }]; } catch { return []; }
  });
  return { library, addons };
}
// Existing entries win; only titles and extensions not already here are added.
export function mergeLibrary(current: { library: Meta[]; addons: Addon[] }, incoming: { library: Meta[]; addons: Addon[] }) {
  const titles = new Set(current.library.map(m => `${m.type}:${m.id}`)), sources = new Set(current.addons.map(a => a.manifest.id));
  const library = incoming.library.filter(m => { const key = `${m.type}:${m.id}`; if (titles.has(key)) return false; titles.add(key); return true; });
  const addons = incoming.addons.filter(a => { if (sources.has(a.manifest.id)) return false; sources.add(a.manifest.id); return true; });
  return { library: [...current.library, ...library], addons: [...current.addons, ...addons], added: { titles: library.length, addons: addons.length } };
}
