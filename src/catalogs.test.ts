import {afterEach, describe, expect, it, vi} from 'vitest';
import {addDefaultCatalogs, migrateAnimeSource, defaultAddons, kitsu, cinemeta, catalogSelection, loadCatalog, loadMetadata, needsMetadata, topResults} from './catalogs';
import {calendarEvents, nextRelease, releaseCountdown, defaultEpisode, episodeLabel, supports, type Meta} from './media';
import {pirateBay,updatePlaybackAddon,titles,replaceCinemeta,yts,addYtsSource,eztv,addEztvSource,torrentDownloads,addTorrentDownloadsSource,torrentClaw,addTorrentClawSource,torrentio,comet,addStremioSource,sourceMigrations} from './catalogs';
import {torrentClawManifest} from '../shared/torrentclaw-manifest.mjs';
const enabledClaw = {...torrentClaw,enabled:true};
afterEach(() => vi.unstubAllGlobals());
describe('default catalogs and anime discovery', () => {
  it('runs each one-time source addition under its own flag, preserving later removals',()=>{
    const flags=sourceMigrations.map(([flag])=>flag);
    expect(new Set(flags).size).toBe(flags.length);
    expect(flags).toEqual(['hasimio:piratebay-v1','hasimio:yts-v1','hasimio:eztv-v1','hasimio:torrentdownloads-v1','hasimio:torrentclaw-v1','hasimio:titles-v1','hasimio:torrentio-v1','hasimio:comet-v1']);
    const migrated=sourceMigrations.reduce((existing,[,apply])=>apply(existing),[] as typeof defaultAddons);
    expect(migrated.map(a=>a.manifest.id)).toEqual([pirateBay,yts,eztv,torrentDownloads,torrentClaw,titles,torrentio,comet].map(a=>a.manifest.id));
    expect(migrated.find(a=>a.manifest.id===torrentClaw.manifest.id)?.enabled).toBe(false);
  });
  it('adds Torrentio and Comet once, preserving configured and disabled sources',()=>{
    expect(defaultAddons).toContain(torrentio);expect(defaultAddons).toContain(comet);
    expect(torrentio.enabled).toBe(true);expect(comet.enabled).toBe(false);
    for(const source of [torrentio,comet]){
      expect(addStremioSource([],source)).toEqual([source]);
      expect(addStremioSource([{...source,enabled:false}],source)).toEqual([{...source,enabled:false}]);
      expect(supports({...source,enabled:true},'stream','anime','kitsu:1:2')).toBe(true);
    }
    const custom={...comet,url:'https://comet.elfhosted.com/settings/manifest.json',manifest:{...comet.manifest,id:'comet.elfhosted.com'}};
    expect(addStremioSource([custom],comet)).toEqual([custom]);
  });
  it('ships TorrentClaw disabled and shares the engine manifest',()=>{
    expect(torrentClaw.enabled).toBe(false);
    expect(catalogSelection(defaultAddons,'','All').filter(c=>c.addon===torrentClaw)).toHaveLength(0);
    expect(torrentClaw.manifest).toBe(torrentClawManifest);
  });
  it('keeps TorrentClaw discovery visible once enabled and upgrades saved playback-only manifests',()=>{
    const addons=defaultAddons.map(a=>a===torrentClaw?enabledClaw:a);
    expect(catalogSelection(addons,'','All').filter(c=>c.addon===enabledClaw)).toHaveLength(2);
    expect(catalogSelection(addons,'Temptation Island RO','Series').filter(c=>c.addon===enabledClaw)).toHaveLength(1);
    const old={...torrentClaw,enabled:false,manifest:{...torrentClaw.manifest,version:'1.0.0',resources:['stream'],catalogs:[]}};
    expect(updatePlaybackAddon([old])).toEqual([{...torrentClaw,enabled:false}]);
    expect(updatePlaybackAddon([yts])).toEqual([yts]);
    expect(supports(enabledClaw,'meta','series','tmdb:62767')).toBe(true);
    expect(supports(enabledClaw,'stream','series','tmdb:62767:1:2')).toBe(true);
  });
  it('advances provider pagination even when some remote entries cannot be mapped',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({metas:[{id:'tmdb:62767',name:'Show',type:'series'}],nextSkip:50,hasMore:true}))));
    const row=await loadCatalog(torrentClaw,torrentClaw.manifest.catalogs[1],'Show');
    expect(row).toMatchObject({skip:50,hasMore:true,source:'TorrentClaw'});
    expect(row.items[0].sourceUrl).toBe(torrentClaw.url);
  });
  it('loads TorrentClaw metadata first for titles discovered there',async()=>{
    const fetch=vi.fn(async(_url:string)=>new Response(JSON.stringify({meta:{id:'tt123',name:'Show',type:'series',videos:[{id:'tt123:1:2',season:1,episode:2}]}})));
    vi.stubGlobal('fetch',fetch);
    const meta=await loadMetadata({id:'tt123',name:'Show',type:'series',sourceUrl:torrentClaw.url},defaultAddons.map(a=>a===torrentClaw?enabledClaw:a));
    expect(meta.videos?.[0].id).toBe('tt123:1:2');expect(fetch.mock.calls[0][0]).toContain('/torrentclaw/meta/series/tt123.json');
  });
  it('adds TorrentClaw once and preserves disabled settings',()=>{
    expect(defaultAddons).toContain(torrentClaw);
    expect(addTorrentClawSource([yts])).toEqual([yts,torrentClaw]);
    expect(addTorrentClawSource([{...torrentClaw,enabled:false}])).toEqual([{...torrentClaw,enabled:false}]);
    expect(supports(enabledClaw,'stream','series','tt123:1:2')).toBe(true);
    expect(supports(enabledClaw,'stream','movie','tt123')).toBe(true);
    expect(supports(enabledClaw,'stream','anime','kitsu:1:2')).toBe(false);
  });
  it('adds TorrentDownloads for movies and series, preserving disabled settings',()=>{
    expect(defaultAddons).toContain(torrentDownloads);expect(addTorrentDownloadsSource([yts])).toEqual([yts,torrentDownloads]);
    expect(addTorrentDownloadsSource([{...torrentDownloads,enabled:false}])).toEqual([{...torrentDownloads,enabled:false}]);
    expect(supports(torrentDownloads,'stream','series','tt123:1:2')).toBe(true);expect(supports(torrentDownloads,'stream','movie','tt123')).toBe(true);
    expect(supports(torrentDownloads,'stream','anime','kitsu:1:2')).toBe(false);
  });
  it('installs EZTV once for IMDb series while preserving disabled settings',()=>{
    expect(defaultAddons).toContain(eztv);expect(addEztvSource([yts])).toEqual([yts,eztv]);
    expect(addEztvSource([{...eztv,enabled:false}])).toEqual([{...eztv,enabled:false}]);
    expect(supports(eztv,'stream','series','tt123:1:2')).toBe(true);
    expect(supports(eztv,'stream','movie','tt123')).toBe(false);
    expect(supports(eztv,'stream','series','kitsu:1:2')).toBe(false);
  });
  it('adds YTS alongside Pirate Bay for movies, preserving existing disabled settings',()=>{
    expect(defaultAddons).toContain(yts);expect(defaultAddons).toContain(pirateBay);
    expect(addYtsSource([pirateBay])).toEqual([pirateBay,yts]);
    expect(addYtsSource([{...yts,enabled:false}])).toEqual([{...yts,enabled:false}]);
    expect(supports(yts,'stream','movie','tt123')).toBe(true);
    expect(supports(yts,'stream','series','tt123:1:2')).toBe(false);
    expect(supports(yts,'stream','movie','kitsu:1')).toBe(false);
  });
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
    const existing=[{...titles,enabled:false}]; const result=addDefaultCatalogs(existing);
    expect(result).toHaveLength(2); expect(result[0].enabled).toBe(false); expect(addDefaultCatalogs(result)).toHaveLength(2);
  });
  it('replaces Cinemeta with Hasimio Titles once, keeping its enabled state', () => {
    expect(replaceCinemeta([kitsu,{...cinemeta,enabled:false}])).toEqual([kitsu,{...titles,enabled:false}]);
    expect(replaceCinemeta([cinemeta,titles])).toEqual([titles]);
    expect(replaceCinemeta([kitsu])).toEqual([kitsu,titles]);
    expect(defaultAddons.some(a => a.url === cinemeta.url)).toBe(false);
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

describe('release countdown',()=>{
  const now=Date.parse('2026-10-29T12:00:00Z');
  it('counts timed releases down to days, hours and minutes',()=>{
    expect(releaseCountdown('2026-10-30T17:00:00.000Z',now)).toBe('In 1 day, 5 hours');
    expect(releaseCountdown('2026-11-05T12:00:00.000Z',now)).toBe('In 7 days');
    expect(releaseCountdown('2026-10-29T17:30:00.000Z',now)).toBe('In 5 hours, 30 minutes');
    expect(releaseCountdown('2026-10-29T12:00:20.000Z',now)).toBe('In 1 minute');
    expect(releaseCountdown('2026-10-29T11:00:00.000Z',now)).toBeUndefined();
  });
  it('counts date-only releases in whole local days',()=>{
    const local=new Date(2026,9,29,12).getTime();
    expect(releaseCountdown('2026-10-29',local)).toBe('Today');
    expect(releaseCountdown('2026-10-30',local)).toBe('Tomorrow');
    expect(releaseCountdown('2026-11-05',local)).toBe('In 7 days');
    expect(releaseCountdown('2026-10-28',local)).toBeUndefined();
    expect(releaseCountdown('2026',local)).toBeUndefined();
  });
});

describe('search top results',()=>{
  const item=(id:string,type:string,name:string,votes?:number):Meta=>({id,type,name,votes});
  it('merges movies and series by popularity, ahead of mid-word matches, without duplicates',()=>{
    const movies={items:[item('m1','movie','The Grey',300000),item('m2','movie','Fifty Shades of Grey',330000),item('m3','movie','Greyhound',110000)]};
    const series={items:[item('s1','series',"Grey's Anatomy",350000),item('s2','series','Greyzone',4000),item('k1','series','Grey anime')]};
    expect(topResults([movies,series,{items:[movies.items[0]]}],'grey').map(m=>m.id)).toEqual(['s1','m2','m1','m3','s2']);
    expect(topResults([{items:[item('a','movie','Spirited Away',900000),item('b','movie','It',500000)]}],'it').map(m=>m.id)).toEqual(['b','a']);
  });
});
