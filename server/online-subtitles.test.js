import {describe,it,expect,vi} from 'vitest';
import {onlineSubtitleResults,searchOnlineSubtitles,downloadOnlineSubtitle,releaseMatch} from './online-subtitles.mjs';

const file=id=>`https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/${id}`;
describe('online subtitles',()=>{
  it('keeps mirror downloads only, removes duplicates and ranks the matching release first',()=>{
    const results=onlineSubtitleResults({subtitles:[
      {url:file(1),lang:'eng',subtitleFileName:'Movie.2010.DVDRip.XviD.srt'},
      {url:file(2),lang:'eng',subtitleFileName:'Movie.2010.1080p.BluRay.x264-GROUP.srt'},
      {url:file(2),lang:'eng',subtitleFileName:'duplicate'},
      {url:'https://example.com/evil.srt',lang:'eng'},
      {url:file(3),lang:'<script>'},
    ]},'Movie.2010.1080p.BluRay.x264-GROUP.mkv');
    expect(results.map(item=>item.id)).toEqual(['2','1']);
    expect(results[0]).toMatchObject({language:'eng',release:'Movie.2010.1080p.BluRay.x264-GROUP.srt',match:1});
    expect(releaseMatch('anything','')).toBe(0);
  });
  it('ranks the same release group and source above title-only matches',()=>{
    const video='The.Movie.2023.1080p.WEB-DL.DDP5.1.H.264-FLUX.mkv';
    const sameGroup=releaseMatch('The Movie 2023 1080p WEB-DL FLUX',video);
    const sameSource=releaseMatch('The.Movie.2023.720p.WEBRip.x264-OTHER',video);
    const otherSource=releaseMatch('The.Movie.2023.1080p.BluRay.x264-SPARKS',video);
    const titleOnly=releaseMatch('The Movie (2023)',video);
    expect(sameGroup).toBeGreaterThan(0.8);
    expect(sameGroup).toBeGreaterThan(sameSource);
    expect(otherSource).toBeLessThan(titleOnly+0.1);
    expect(releaseMatch('Film.2020.Web.DL.srt','Film.2020.WEBDL.mkv')).toBe(1);
  });
  it('asks the movie or series route for IMDb ids and rejects others',async()=>{
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({subtitles:[]})));
    await searchOnlineSubtitles('tt0903747:1:2','',fetchImpl);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://opensubtitles-v3.strem.io/subtitles/series/tt0903747%3A1%3A2.json');
    await searchOnlineSubtitles('tt0111161','',fetchImpl);
    expect(String(fetchImpl.mock.calls[1][0])).toBe('https://opensubtitles-v3.strem.io/subtitles/movie/tt0111161.json');
    await expect(searchOnlineSubtitles('kitsu:1','',fetchImpl)).rejects.toThrow('IMDb');
  });
  it('downloads by numeric id only',async()=>{
    const fetchImpl=vi.fn(async()=>new Response('1\n00:00:01,000 --> 00:00:02,000\nHi\n'));
    expect(await downloadOnlineSubtitle('42',fetchImpl)).toContain('Hi');
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/\/file\/42$/);
    await expect(downloadOnlineSubtitle('../x',fetchImpl)).rejects.toThrow();
  });
});
