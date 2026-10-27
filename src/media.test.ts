import { describe, expect, it } from 'vitest';
import { manifestUrl, resourceUrl, validateManifest, supports, demoAddon, calendarEvents, safeHttp } from './media';
describe('add-on protocol', () => {
  it('encodes multi-word searches for the Stremio path protocol',()=>{expect(resourceUrl('https://example.org/manifest.json','catalog','movie','top',{search:'Big Buck Bunny'})).toBe('https://example.org/catalog/movie/top/search=Big%20Buck%20Bunny.json');});
  it('normalizes manifest addresses and rejects unsafe protocols', () => { expect(manifestUrl('stremio://example.org/config')).toBe('https://example.org/config/manifest.json'); expect(() => manifestUrl('javascript:alert(1)')).toThrow(); expect(() => manifestUrl('https://user:secret@example.org/manifest.json')).toThrow(); });
  it('preserves configured paths and query parameters while encoding IDs', () => { const url = resourceUrl('https://example.org/token/manifest.json?key=abc','stream','series','tt123:1:2'); expect(url).toBe('https://example.org/token/stream/series/tt123%3A1%3A2.json?key=abc'); });
  it('honors resource-level types and prefixes', () => { const addon = {...demoAddon,manifest:{...demoAddon.manifest,resources:[{name:'stream',types:['series'],idPrefixes:['tt']}]}}; expect(supports(addon,'stream','series','tt123:1:2')).toBe(true); expect(supports(addon,'stream','movie','tt123')).toBe(false); expect(supports({...addon,enabled:false},'stream','series','tt123')).toBe(false); });
  it('rejects malformed manifests and safely defaults absent catalogs', () => { expect(() => validateManifest({id:'bad'})).toThrow(); expect(validateManifest({...demoAddon.manifest,catalogs:undefined}).catalogs).toEqual([]); });
  it('excludes unsafe external links', () => { expect(safeHttp('javascript:alert(1)')).toBeUndefined(); expect(safeHttp('https://example.org/movie.mp4')).toBe('https://example.org/movie.mp4'); });
});
describe('episode calendar', () => {
  it('uses actual episode release dates and the selected month', () => { const events = calendarEvents([{id:'tt1',type:'series',name:'A series',videos:[{id:'a',season:1,episode:1,released:'2026-10-15T12:00:00Z'},{id:'b',season:1,episode:2,released:'2026-11-01T12:00:00Z'},{id:'c',season:1,episode:3}]}],new Date(2026,9,1)); expect(events).toHaveLength(1); expect(events[0].day).toBe(15); expect(events[0].video.id).toBe('a'); });
});
