import { describe, expect, it } from 'vitest';
import { exportLibrary, mergeLibrary, parseLibrary } from './library-transfer';
import { type Addon, type Meta } from './media';
import { demoAddon } from './media';
import { pirateBay, cinemeta } from './catalogs';

const dune: Meta = { id: 'tt1160419', type: 'movie', name: 'Dune' };
const show: Meta = { id: 'tt11198330', type: 'series', name: 'House of the Dragon' };
const custom: Addon = { url: 'https://addon.example/manifest.json', enabled: false, manifest: { ...cinemeta.manifest, id: 'example.custom', name: 'Custom' } };

describe('library export and import', () => {
  it('round-trips titles and extensions, leaving out the built-in demo source', () => {
    const file = exportLibrary([dune, show], [demoAddon, cinemeta, pirateBay, custom], new Date('2026-10-28T00:00:00Z'));
    expect(file.exportedAt).toBe('2026-10-28T00:00:00.000Z');
    const parsed = parseLibrary(JSON.stringify(file));
    expect(parsed.library).toEqual([dune, show]);
    expect(parsed.addons.map(a => a.manifest.id)).toEqual([cinemeta.manifest.id, pirateBay.manifest.id, 'example.custom']);
    expect(parsed.addons[2].enabled).toBe(false);
  });
  it('rejects files that are not Hasimio exports', () => {
    for (const text of ['not json', '[]', '{"format":"other","version":1,"library":[]}', '{"format":"hasimio-library","version":2,"library":[]}']) expect(() => parseLibrary(text)).toThrow('not a Hasimio library export');
  });
  it('drops malformed titles, built-in flags, invalid manifests and unsafe add-on URLs', () => {
    const text = JSON.stringify({ format: 'hasimio-library', version: 1, library: [dune, { id: 1, type: 'movie', name: 'Bad' }, null], addons: [
      { ...custom, builtin: true }, { ...custom, url: 'javascript:alert(1)' }, { ...custom, url: 'https://user:pass@addon.example/manifest.json' }, { ...custom, manifest: { id: 'x' } }, custom,
    ] });
    const parsed = parseLibrary(text);
    expect(parsed.library).toEqual([dune]);
    expect(parsed.addons.map(a => a.url)).toEqual([custom.url]);
  });
  it('keeps existing entries and adds only new ones', () => {
    const merged = mergeLibrary({ library: [dune], addons: [cinemeta] }, { library: [{ ...dune, name: 'Changed' }, show, show], addons: [cinemeta, custom] });
    expect(merged.library).toEqual([dune, show]);
    expect(merged.addons.map(a => a.manifest.id)).toEqual([cinemeta.manifest.id, 'example.custom']);
    expect(merged.added).toEqual({ titles: 1, addons: 1 });
  });
});
