import {describe,it,expect,vi} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {addic7edResults,createAddic7ed,createSubsRo,createYify,subsRoResults,yifyResults} from './subtitle-sources.mjs';
import {createOnlineSubtitleService} from './online-subtitles.mjs';
import {pickSubtitle} from './subtitle-archive.mjs';

const srt=line=>`1\n00:00:01,000 --> 00:00:02,000\n${line}\n`;
// subs.ro opens each entry with its id tag, before the title link (which has attributes between href and title).
const subsEntry=(sid,lang,title,comment)=>`<div class="group" data-subtitle-result="true" data-subtitle-id="${sid}" data-imdb-id="0903747" data-language="${lang}">
  <h3 data-field="title"><a href="https://subs.ro/subtitrare/breaking-bad/${sid}" class="link" title="Subtitrare ${title}">Breaking Bad</a></h3>
  <div data-field="comment-text"><strong>${comment}</strong></div>
  <a href="https://subs.ro/subtitrare/descarca/breaking-bad/${sid}" data-action="download" data-subtitle-id="${sid}" data-movie-name="Breaking Bad">Descarcă</a>
</div>`;
const subsPage=[subsEntry(5,'ro','Breaking Bad - Sezonul 5 HD 720p','Sezonul 5 &amp; complet'),subsEntry(4,'ro','Breaking Bad - Sezonul 4','S4'),subsEntry(9,'en','Breaking Bad HD 720p','All seasons'),subsEntry(7,'ro','Breaking Bad DVDRIP','Toate sezoanele')].join('\n');
const response=(body,{status=200,type='text/html'}={})=>new Response(body,{status,headers:{'content-type':type}});

describe('subs.ro',()=>{
  it('pairs each entry with its own title and keeps only the language and season asked for',()=>{
    const results=subsRoResults(subsPage,{digits:'0903747',season:5,episode:1,language:'ro',filename:'Breaking.Bad.S05E01.720p.HDTV.x264-EVOLVE.mkv'});
    expect(results.map(item=>item.id).sort()).toEqual(['subsro-ro-5-5-1','subsro-ro-7-5-1']);
    expect(results.find(item=>item.id==='subsro-ro-5-5-1')).toMatchObject({language:'rum',provider:'subs.ro',release:'Breaking Bad - Sezonul 5 HD 720p · Sezonul 5 & complet'});
    expect(subsRoResults(subsPage,{digits:'0903747',language:'en'}).map(item=>item.id)).toEqual(['subsro-en-9']);
    expect(subsRoResults(subsPage,{digits:'1111111',language:'ro'})).toEqual([]);
  });
  it('downloads the season pack and picks the episode in the right language',async()=>{
    const archive=zipSync({'Show.S05E01.HDTV.en.srt':strToU8(srt('Hello')),'Show.S05E01.HDTV.srt':strToU8(srt('Salut')),'Show.S05E02.HDTV.srt':strToU8(srt('Alt episod'))});
    const fetchImpl=vi.fn(async()=>response(archive,{type:'application/zip'}));
    const text=await createSubsRo({fetchImpl}).download('subsro-ro-5-5-1');
    expect(text).toContain('Salut');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://subs.ro/subtitrare/descarca/subtitrare/5');
    await expect(createSubsRo({fetchImpl:async()=>response('',{status:429})}).download('subsro-ro-5')).rejects.toThrow('limiting requests');
  });
  it('picks the cut closest to the video from a pack with several per episode',async()=>{
    const archive=zipSync({'Breaking.Bad.S05E01.HDTV.XviD-FQM.srt':strToU8(srt('FQM')),'Breaking.Bad.S05E01.720p.HDTV.x264-EVOLVE.srt':strToU8(srt('EVOLVE'))});
    const fetchImpl=vi.fn(async url=>String(url).includes('/imdbid/')?response(subsPage):response(archive,{type:'application/zip'}));
    const subsRo=createSubsRo({fetchImpl});
    expect(await subsRo.download('subsro-ro-5-5-1')).toContain('FQM');
    await subsRo.search('tt0903747:5:1','Breaking.Bad.S05E01.720p.HDTV.x264-EVOLVE.mkv','ro');
    expect(await subsRo.download('subsro-ro-5-5-1')).toContain('EVOLVE');
    await expect(createSubsRo({fetchImpl}).download('subsro-xx-5')).rejects.toThrow('online list');
  });
});

describe('YIFY Subtitles',()=>{
  const page=`<table><tr data-id="1"><td><span class="label label-success">2</span></td><td><span class="sub-lang">Romanian</span></td><td><a href="/subtitles/movie-1994-romanian-yify-1"><span class="text-muted">subtitle</span> Movie.1994.720p.BluRay.x264.YIFY</a></td></tr>
<tr data-id="2"><td><span class="label">9</span></td><td><span class="sub-lang">Romanian</span></td><td><a href="/subtitles/movie-1994-romanian-yify-2"><span class="text-muted">subtitle</span> Movie 1994</a></td></tr>
<tr data-id="3"><td><span class="label">5</span></td><td><span class="sub-lang">English</span></td><td><a href="/subtitles/movie-1994-english-yify-3">subtitle Movie</a></td></tr>
<tr data-id="4"><td><span class="sub-lang">Romanian</span></td><td><a href="/subtitles/../evil">x</a></td></tr></table>`;
  it('lists one language, ranks the matching release and then the rating',()=>{
    expect(yifyResults(page,{language:'ro',filename:'Movie.1994.720p.BluRay.x264.YIFY.mp4'}).map(item=>item.id)).toEqual(['yify-ro-movie-1994-romanian-yify-1','yify-ro-movie-1994-romanian-yify-2']);
    expect(yifyResults(page,{language:'ro'}).map(item=>item.id)).toEqual(['yify-ro-movie-1994-romanian-yify-2','yify-ro-movie-1994-romanian-yify-1']);
    expect(yifyResults(page,{language:'en'})).toMatchObject([{id:'yify-en-movie-1994-english-yify-3',language:'eng',release:'Movie'}]);
  });
  it('answers for movies only and sends the subtitle page as referer',async()=>{
    const fetchImpl=vi.fn(async()=>response(zipSync({'Movie.srt':strToU8(srt('Salut'))}),{type:'application/zip'}));
    const yify=createYify({fetchImpl});
    expect(await yify.search('tt1:1:1','','ro')).toEqual({subtitles:[]});
    expect(await yify.download('yify-ro-movie-1994-romanian-yify-1')).toContain('Salut');
    expect(fetchImpl.mock.calls[0][1].headers.Referer).toBe('https://yifysubtitles.ch/subtitles/movie-1994-romanian-yify-1');
  });
});

describe('Addic7ed through Gestdown',()=>{
  it('finds the show through its TVDB id and lists finished versions',async()=>{
    const fetchImpl=vi.fn(async url=>{
      if(url.includes('cinemeta'))return response(JSON.stringify({meta:{tvdb_id:81189}}),{type:'application/json'});
      if(url.includes('/shows/external/tvdb/81189'))return response(JSON.stringify({shows:[{id:'1WLU6zJky4nlJQa5oojv5R',name:'Breaking Bad'}]}),{type:'application/json'});
      if(url.endsWith('/subtitles/get/1WLU6zJky4nlJQa5oojv5R/5/1/English'))return response(JSON.stringify({matchingSubtitles:[{subtitleId:'aaaaaaaa1',version:'FQM',completed:true},{subtitleId:'aaaaaaaa2',version:'EVOLVE',completed:true,hearingImpaired:true},{subtitleId:'aaaaaaaa3',version:'WIP',completed:false}]}),{type:'application/json'});
      return response('',{status:404});
    });
    const addic7ed=createAddic7ed({fetchImpl});
    const {subtitles}=await addic7ed.search('tt0903747:5:1','Breaking.Bad.S05E01.720p.HDTV.x264-EVOLVE.mkv','en');
    expect(subtitles.map(item=>item.id)).toEqual(['a7-aaaaaaaa2','a7-aaaaaaaa1']);
    expect(subtitles[0]).toMatchObject({language:'eng',release:'Breaking Bad · EVOLVE · HI'});
    expect(await addic7ed.search('tt0903747','','en')).toEqual({subtitles:[]});
    expect((await addic7ed.search('tt0903747:9:9','','en')).subtitles).toEqual([]);
    expect(addic7edResults({},{})).toEqual([]);
  });
});

describe('online subtitle service with extra sources',()=>{
  it('asks extra sources only for their languages and routes downloads by id',async()=>{
    const source={name:'Extra',prefix:'extra-',languages:['ro'],search:vi.fn(async()=>({subtitles:[{id:'extra-1',language:'rum',release:'R',match:0.9}]})),download:vi.fn(async()=>'extra text')};
    const fetchImpl=vi.fn(async()=>response(JSON.stringify({subtitles:[]}),{type:'application/json'}));
    const service=createOnlineSubtitleService({fetchImpl,sources:[source]});
    expect((await service.search('tt1','','rum')).subtitles).toMatchObject([{id:'extra-1',provider:'Extra'}]);
    await service.search('tt1','','eng');await service.search('tt1','','fre');
    expect(source.search).toHaveBeenCalledTimes(1);
    expect(await service.download('extra-1')).toBe('extra text');
  });
  it('gives up on a source that does not answer in time',async()=>{
    vi.useFakeTimers();
    try{
      const stuck={name:'Stuck',prefix:'stuck-',languages:['en'],search:()=>new Promise(()=>{}),download:async()=>''};
      const fetchImpl=async()=>response(JSON.stringify({subtitles:[]}),{type:'application/json'});
      const pending=createOnlineSubtitleService({fetchImpl,sources:[stuck]}).search('tt1','','eng');
      await vi.advanceTimersByTimeAsync(10001);
      expect((await pending).warnings).toEqual(['Stuck took too long to answer.']);
    }finally{vi.useRealTimers();}
  });
  it('still lists the others when one source fails',async()=>{
    const broken={name:'Broken',prefix:'broken-',languages:['en'],search:async()=>{throw Error('Broken is down.');},download:async()=>''};
    const fetchImpl=async()=>response(JSON.stringify({subtitles:[{url:'https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/7',lang:'eng'}]}),{type:'application/json'});
    const result=await createOnlineSubtitleService({fetchImpl,sources:[broken]}).search('tt1','','eng');
    expect(result.subtitles.map(item=>item.id)).toEqual(['7']);
    expect(result.warnings).toEqual(['Broken is down.']);
  });
});

describe('archive subtitle choice',()=>{
  it('reads English files that are not UTF-8 as Windows-1252',()=>{
    const bytes=Uint8Array.from([...strToU8('1\n00:00:01,000 --> 00:00:02,000\nCaf'),0xe9,10]);
    expect(pickSubtitle([{name:'Movie.srt',data:bytes}],{language:'en'})).toContain('Café');
  });
  it('skips files marked as the other language',()=>{
    const files=[{name:'Movie.RO.srt',data:strToU8(srt('Salut'))},{name:'Movie.ENG.srt',data:strToU8(srt('Hello'))}];
    expect(pickSubtitle(files,{language:'en'})).toContain('Hello');
    expect(pickSubtitle(files,{language:'ro'})).toContain('Salut');
    expect(()=>pickSubtitle(files,{language:'ro',season:1,episode:2})).toThrow('selected episode');
  });
});
