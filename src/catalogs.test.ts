import {afterEach, describe, expect, it, vi} from 'vitest';
import {addDefaultCatalogs, defaultAddons, kitsu, cinemeta, catalogSelection, loadCatalog, loadMetadata, needsMetadata} from './catalogs';
import {calendarEvents, nextRelease, episodeLabel, type Meta} from './media';
afterEach(() => vi.unstubAllGlobals());
describe('default catalogs and anime discovery', () => {
  it('upgrades existing installations without duplicates or re-enabling disabled sources', () => {
    const existing=[{...cinemeta,enabled:false}]; const result=addDefaultCatalogs(existing);
    expect(result).toHaveLength(2); expect(result[0].enabled).toBe(false); expect(addDefaultCatalogs(result)).toHaveLength(2);
  });
  it('separates anime catalogs and respects search and required extras', () => {
    expect(catalogSelection(defaultAddons,'','Anime').every(c => c.catalog.type === 'anime')).toBe(true);
    expect(catalogSelection(defaultAddons,'naruto','Anime').map(c => c.catalog.id)).toEqual(['kitsu-anime-list']);
    expect(catalogSelection(defaultAddons,'','Movies').every(c => c.catalog.type === 'movie')).toBe(true);
    expect(catalogSelection([{...kitsu,enabled:false}],'','Anime')).toEqual([]);
  });
  it('preserves anime identity when Kitsu uses series as the playback type', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({metas:[{id:'kitsu:12',type:'series',name:'One Piece'}]}))));
    const row=await loadCatalog(kitsu,kitsu.manifest.catalogs[1],'',20);
    expect(row.items[0]).toMatchObject({category:'anime',type:'series',sourceUrl:kitsu.url});
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('skip=20.json');
  });
});
describe('automatic library release hydration', () => {
  const preview:Meta={id:'kitsu:12',type:'series',name:'One Piece',category:'anime',sourceUrl:kitsu.url};
  it('loads full episodes after saving a catalog preview, retaining anime identity', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({meta:{id:'kitsu:12',type:'series',name:'One Piece',videos:[{id:'kitsu:12:1',season:1,episode:1,released:'2026-11-02T12:00:00Z'}]}}))));
    const saved=await loadMetadata(preview,defaultAddons);
    expect(saved.category).toBe('anime'); expect(needsMetadata(saved)).toBe(false);
    expect(calendarEvents([saved],new Date(2026,10,1))).toHaveLength(1);
    expect(nextRelease(saved,Date.parse('2026-10-27'))?.episode).toBe(1);
  });
  it('keeps known release dates on provider failure and reports retryable state', async () => {
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
    const saved=await loadMetadata({...preview,videos:[{id:'ep',episode:1,released:'2026-11-02T12:00:00Z'}]},defaultAddons);
    expect(saved.metadataError).toContain('could not be updated'); expect(saved.videos).toHaveLength(1);
    expect(needsMetadata(saved,saved.metadataFetchedAt!+11*60*1000)).toBe(true);
  });
  it('expires successful metadata after six hours', () => {
    expect(needsMetadata({...preview,metadataFetchedAt:1000},1000+5*60*60*1000)).toBe(false);
    expect(needsMetadata({...preview,metadataFetchedAt:1000},1000+6*60*60*1000)).toBe(true);
  });
});
describe('movie and episode release semantics', () => {
  it('includes exact movie release dates but never fabricates dates from a year', () => {
    const movie:Meta={id:'movie',type:'movie',name:'A movie',released:'2026-11-03T12:00:00Z'};
    expect(calendarEvents([movie],new Date(2026,10,1))[0].video.title).toBe('Movie release');
    expect(episodeLabel(movie,nextRelease(movie,0)!)).toBe('Movie release');
    expect(calendarEvents([{...movie,released:'2026',releaseInfo:'2026'}],new Date(2026,0,1))).toEqual([]);
  });
  it('keeps dated specials and anime with missing seasons, deduplicating episodes', () => {
    const episode={id:'ep',episode:0,season:0,released:'2026-11-03T12:00:00Z'};
    expect(calendarEvents([{id:'anime',name:'Anime',type:'anime',videos:[episode,episode,{id:'unknown',released:'invalid'}]}],new Date(2026,10,1))).toHaveLength(1);
    expect(nextRelease({id:'past',name:'Past',type:'series',videos:[episode]},Date.parse('2027-01-01'))).toBeUndefined();
  });
});
