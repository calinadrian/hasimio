import {afterEach, describe, expect, it, vi} from 'vitest';
import {addDefaultCatalogs, migrateAnimeSource, defaultAddons, kitsu, cinemeta, catalogSelection, loadCatalog, loadMetadata, needsMetadata} from './catalogs';
import {calendarEvents, nextRelease, defaultEpisode, episodeLabel, supports, type Meta} from './media';
import {pirateBay,updatePlaybackAddon} from './catalogs';
afterEach(() => vi.unstubAllGlobals());
describe('default catalogs and anime discovery', () => {
  it('replaces old community sources before use, preserving disabled and removed sources',()=>{
    const old={...kitsu,url:'https://anime-kitsu.strem.fun/manifest.json',enabled:false,manifest:{...kitsu.manifest,id:'community.anime.kitsu'}};
    expect(migrateAnimeSource([old])).toEqual([{...kitsu,enabled:false}]);
    expect(migrateAnimeSource([])).toEqual([]);
    expect(migrateAnimeSource([old,kitsu])).toHaveLength(1);
  });
  it('updates installed playback support while preserving disabled and removed extensions', () => {
    const [updated]=updatePlaybackAddon([{...pirateBay,enabled:false,manifest:{...pirateBay.manifest,version:'1.0.0',idPrefixes:['tt']}}]);
    expect(updated.enabled).toBe(false);
    expect(supports({...updated,enabled:true},'stream','series','kitsu:11:1')).toBe(true);
    expect(updatePlaybackAddon([])).toEqual([]);
  });
  it('defaults playback to a released regular episode rather than the next calendar release', () => {
    const meta:Meta={id:'tt1',name:'Show',type:'series',videos:[{id:'special',season:0,episode:1,released:'2020-01-01'},{id:'future',season:1,episode:2,released:'2099-01-01'},{id:'pilot',season:1,episode:1,released:'2020-01-01'}]};
    expect(defaultEpisode(meta)?.id).toBe('pilot');
    expect(defaultEpisode({...meta,videos:[meta.videos![1]]})).toBeUndefined();
  });
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
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{id:'12',type:'anime',attributes:{canonicalTitle:'One Piece',subtype:'TV'}}],links:{next:'https://untrusted.invalid'}}))));
    const row=await loadCatalog(kitsu,kitsu.manifest.catalogs[1],'',20);
    expect(row.items[0]).toMatchObject({category:'anime',type:'series',sourceUrl:kitsu.url});
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('page%5Boffset%5D=20');
    expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).origin).toBe('https://kitsu.io');
  });
});
describe('automatic library release hydration', () => {
  const preview:Meta={id:'kitsu:12',type:'series',name:'One Piece',category:'anime',sourceUrl:kitsu.url};
  it('loads full episodes after saving a catalog preview, retaining anime identity', async () => {
    vi.stubGlobal('fetch',vi.fn(async url=>new Response(JSON.stringify(String(url).includes('/episodes') ? {data:[{type:'episodes',attributes:{number:1,seasonNumber:1,airdate:'2026-11-02'}}]} : {data:{id:'12',type:'anime',attributes:{canonicalTitle:'One Piece',subtype:'TV'}}}))));
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
