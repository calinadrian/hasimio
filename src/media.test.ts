import { describe, expect, it } from 'vitest';
import { manifestUrl, resourceUrl, validateManifest, supports, demoAddon, calendarEvents, safeHttp, releaseTime, releasedEpisodes, type Video } from './media';
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
describe('episode releases', () => {
  const now = new Date(2026, 10, 23, 12).getTime(), day = 86_400_000;
  const at = (offset: number) => new Date(now + offset * day).toISOString();
  const episode = (id: string, season: number, number: number, released?: string): Video => ({ id, season, episode: number, released });
  const ids = (videos: Video[]) => videos.map(video => video.id);
  it('reads timed and date-only releases, and ignores a bare year', () => {
    expect(releaseTime('2026-11-25T02:00:00.000Z')).toBe(Date.UTC(2026, 10, 25, 2));
    expect(releaseTime('2026-11-25')).toBe(new Date(2026, 10, 25).getTime());
    expect(releaseTime('2027')).toBeUndefined();
    expect(releaseTime(undefined)).toBeUndefined();
  });
  it('treats an announced episode without a date as not out yet', () => {
    const show = [episode('a', 1, 1, at(-20)), episode('b', 1, 2, at(-10)), episode('c', 2, 1), episode('d', 2, 2)];
    expect(ids(releasedEpisodes(show, now))).toEqual(['a', 'b']);
    // Dated but still to come, and a special that came out, do not open up the undated season.
    expect(ids(releasedEpisodes([...show, episode('e', 3, 1, at(30)), episode('s', 0, 1, at(-1))], now))).toEqual(['a', 'b', 's']);
  });
  it('keeps undated episodes from sources without dates and gaps before a released episode', () => {
    expect(ids(releasedEpisodes([episode('a', 1, 1), episode('b', 1, 2)], now))).toEqual(['a', 'b']);
    expect(ids(releasedEpisodes([episode('a', 1, 1), episode('b', 2, 1, at(5))], now))).toEqual(['a']);
    expect(ids(releasedEpisodes([episode('a', 1, 1, at(-9)), episode('b', 1, 2), episode('c', 1, 3, at(-2)), episode('d', 1, 4)], now))).toEqual(['a', 'b', 'c']);
  });
  it('counts undated episodes as out while dates are still loading, but never dated ones still to come', () => {
    const mixed = [episode('a', 1, 1, at(-20)), episode('b', 2, 1), episode('c', 2, 2, at(3))];
    expect(ids(releasedEpisodes(mixed, now))).toEqual(['a']);
    expect(ids(releasedEpisodes(mixed, now, true))).toEqual(['a', 'b']);
  });
});
