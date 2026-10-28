import {describe,it,expect,vi} from 'vitest';
import {matchesTorrentTitle,torrentDownloadRows,torrentDownloadStream,searchTorrentDownloads,torrentDownloadsManifest} from './torrentdownloads.mjs';
import {createMediaService} from './service.mjs';
const hash='a'.repeat(40),meta={name:"Grey’s Anatomy",start:2005},video={imdb:'tt0413573',season:23,episode:1};
const title='Greys Anatomy S23E01 1080p HEVC x265-Group mkv';
const row=(name=title,path='/torrent/123/show',seeds=12)=>`<div class="grey_bar3 back_none"><p><img src="icon.png"><a href="${path}" title="View torrent info : ${name}">Short label...</a></p><span class="health"><img></span><span>2</span><span>${seeds}</span><span>1.25&nbsp;GB</span></div>`;
const searchPage=rows=>'<title>Torrent Downloads - Search</title>'+rows;
const detail=(value=hash)=>`<title>Show - Torrent Downloads</title><a href="magnet:?xt=urn:btih:${value}&amp;dn=Show">Magnet</a>`;
describe('TorrentDownloads matching and parsing',()=>{
  it('uses full titles, entity decoding, and numeric seed/size fields while restricting detail URLs',()=>{
    const rows=torrentDownloadRows(searchPage(row()+row('Other','//evil.example/torrent/1/x')+row(title,'/torrent/123/show')));
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({name:title,seeders:12,sizeBytes:1.25*1024**3,url:'https://www.torrentdownloads.pro/torrent/123/show'});
    expect(torrentDownloadRows(row('A &amp; B'))[0].name).toBe('A & B');
  });
  it('matches the exact series and episode, excluding sequels, other episodes and executable/archive labels',()=>{
    expect(matchesTorrentTitle(title,meta,video)).toBe(true);
    for(const name of ['Greys Anatomy S23E02 1080p','Greys Anatomy S22E01 1080p','Greys Anatomy New Show S23E01',
      'Greys Anatomy S23E01E02 1080p','Greys Anatomy S23E01 1080p exe','Greys Anatomy S23E01.msi',
      'Greys Anatomy S23E01 1080p 7z','Greys Anatomy S23E01.rar'])expect(matchesTorrentTitle(name,meta,video),name).toBe(false);
  });
  it('requires a movie title and year match rather than accepting remakes and sequels',()=>{
    const movie={name:'Film',start:2020},id={imdb:'tt123'};
    expect(matchesTorrentTitle('Film (2020) 1080p',movie,id)).toBe(true);
    expect(matchesTorrentTitle('Film 2021 1080p',movie,id)).toBe(false);
    expect(matchesTorrentTitle('Film Two 2020 1080p',movie,id)).toBe(false);
  });
  it('extracts hashes without following supplied links and rejects explicit IMDb mismatches',()=>{
    const parsed=torrentDownloadRows(row())[0];
    expect(torrentDownloadStream(detail(),parsed,video.imdb)).toMatchObject({provider:'TorrentDownloads',infoHash:hash,quality:'1080p',codec:'HEVC',seeders:12});
    expect(torrentDownloadStream(detail('invalid'),parsed,video.imdb)).toBeUndefined();
    expect(torrentDownloadStream(detail()+'<a href="https://imdb.com/title/tt999">IMDb</a>',parsed,video.imdb)).toBeUndefined();
  });
  it('queries the resolved title, filters bad releases before fetching details, and keeps partial successes',async()=>{
    const fetch=vi.fn(async url=>String(url).includes('/search/')?new Response(searchPage(row()+row(title+' exe','/torrent/2/bad')+row(title,'/torrent/3/error'))):String(url).includes('/3/')?new Response('',{status:503}):new Response(detail()));
    const result=await searchTorrentDownloads('series','tt0413573:23:1',fetch,async()=>meta);
    expect(result.streams).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.some(([url])=>String(url).includes('/2/'))).toBe(false);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('search')).toBe('Greys Anatomy S23E01');
    expect(fetch.mock.calls[0][1]).toMatchObject({redirect:'error',credentials:'omit'});
  });
  it('reports blocked and broken pages while treating a genuine empty search as no sources',async()=>{
    const lookup=async()=>meta;
    expect(await searchTorrentDownloads('series','tt0413573:23:1',async()=>new Response(searchPage('No torrents found')),lookup)).toEqual({streams:[]});
    await expect(searchTorrentDownloads('series','tt0413573:23:1',async()=>new Response('<title>Just a moment...</title>'),lookup)).rejects.toThrow('verification');
    await expect(searchTorrentDownloads('series','tt0413573:23:1',async()=>new Response('<title>Something else</title>'),lookup)).rejects.toThrow('unrecognised');
    const fetch=vi.fn();await expect(searchTorrentDownloads('series','kitsu:1:2',fetch,lookup)).rejects.toThrow('supports IMDb');expect(fetch).not.toHaveBeenCalled();
  });
  it('serves the extension manifest and caches successful sources through the local service',async()=>{
    const fetch=vi.fn(async url=>new Response(String(url).includes('/search/')?searchPage(row()):detail()));
    const service=createMediaService({fetchImpl:fetch,titles:{close:async()=>{},title:async()=>meta},allowedOrigins:new Set()});
    async function request(url){let body;await service.handle({method:'GET',url,headers:{host:'127.0.0.1:11475'},socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},writeHead(){},end(text){body=JSON.parse(text);}});return body;}
    try{
      expect(await request('/api/extensions/torrentdownloads/manifest.json')).toEqual(torrentDownloadsManifest);
      const url='/api/extensions/torrentdownloads/stream/series/tt0413573%3A23%3A1.json';
      expect((await request(url)).streams[0].provider).toBe('TorrentDownloads');await request(url);expect(fetch).toHaveBeenCalledTimes(2);
    }finally{await service.close();}
  });
});
