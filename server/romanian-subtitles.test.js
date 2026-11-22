import {describe,it,expect,vi} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {createRomanianSubtitles} from './romanian-subtitles.mjs';

const srt=line=>`1\n00:00:01,000 --> 00:00:02,000\n${line}\n`;
const block=(record,title,comment)=>`<div id="round"><a href="https://www.imdb.com/title/tt0903747/">IMDb</a>
  <a href="movie_details.php?id=${record}">${title}</a><div style="font-weight:bold;font-style:italic">${comment}</div>
  <a href="/${record}_breaking_bad.zip">Download</a></div>`;
const page=`<div align="center"></div>${block(11,'Breaking Bad S05E01','HDTV')}${block(12,'Breaking Bad S04E01','HDTV')}${block(13,'Breaking Bad sezonul 5','toate')}`;
const response=(body,type='text/html')=>new Response(body,{status:200,headers:{'content-type':type}});

describe('Subtitrari-noi.ro',()=>{
  it('searches by the IMDb number without "tt" and downloads the episode from the archive',async()=>{
    const archive=zipSync({'Breaking.Bad.S05E01.eng.srt':strToU8(srt('Hello')),'Breaking.Bad.S05E01.srt':strToU8(srt('Salut'))});
    const fetchImpl=vi.fn(async url=>String(url).endsWith('.zip')?response(archive,'application/zip'):response(page));
    const noi=createRomanianSubtitles({fetchImpl});
    const {subtitles}=await noi.search('tt0903747:5:1','Breaking.Bad.S05E01.720p.HDTV.mkv');
    expect(new URLSearchParams(fetchImpl.mock.calls[0][1].body).get('cautare')).toBe('0903747');
    expect(subtitles.map(item=>item.id).sort()).toEqual(['noi-11-5-1','noi-13-5-1']);
    expect(await noi.download('noi-11-5-1')).toContain('Salut');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://www.subtitrari-noi.ro/11_breaking_bad.zip');
    await expect(noi.download('noi-99')).rejects.toThrow('Search again');
  });
});
