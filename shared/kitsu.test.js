import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
import {animeMeta,kitsuCatalog,kitsuMetadata,kitsuSeries,parseSeasonTitle} from './kitsu.mjs';

const anime={id:'12',type:'anime',attributes:{canonicalTitle:'A title',subtype:'TV'}};
const response=value=>new Response(JSON.stringify(value));
describe('Hasimio Kitsu adapter trust boundaries',()=>{
  it('discards extra fields and executable image URLs',()=>{
    const meta=animeMeta({...anime,attributes:{...anime.attributes,posterImage:{large:'javascript:alert(1)'},coverImage:{large:'https://user:pass@example.org/a'},videos:[{id:'injected'}],sourceUrl:'https://evil.invalid',synopsis:'<script>alert(1)</script>'}});
    expect(meta.poster).toBeUndefined();expect(meta.background).toBeUndefined();
    expect(meta.videos).toBeUndefined();expect(meta.sourceUrl).toBeUndefined();
    expect(meta.description).toBe('<script>alert(1)</script>'); // Rendered as React text.
    expect(()=>animeMeta({id:'bad/path',type:'anime',attributes:anime.attributes})).toThrow();
  });
  it('builds episode pages on a fixed origin instead of following supplied links',async()=>{
    const fetch=vi.fn().mockImplementationOnce(()=>response({data:anime}))
      .mockImplementationOnce(()=>response({data:[{type:'episodes',attributes:{number:14,relativeNumber:1,seasonNumber:2}}],links:{next:'http://127.0.0.1/private'}}))
      .mockImplementationOnce(()=>response({data:[{type:'episodes',attributes:{number:15,relativeNumber:2,seasonNumber:2}}]}));
    const meta=await kitsuMetadata('kitsu:12',undefined,fetch);
    expect(meta.videos).toMatchObject([{id:'kitsu:12:14',episode:1,season:2},{id:'kitsu:12:15',episode:2,season:2}]);
    expect(fetch.mock.calls.every(([url,options])=>url.origin==='https://kitsu.io' && options.credentials==='omit' && options.redirect==='error')).toBe(true);
    expect(fetch.mock.calls[2][0].searchParams.get('page[offset]')).toBe('20');
  });
  it('rejects mismatched identities and malformed collections',async()=>{
    await expect(kitsuMetadata('kitsu:12',undefined,async()=>response({data:{...anime,id:'99'}}))).rejects.toThrow('different anime');
    await expect(kitsuCatalog('kitsu-anime-popular','',0,undefined,async()=>response({data:{}}))).rejects.toThrow('invalid catalog');
  });
  it('lists the most popular search matches first',async()=>{
    const record=(id,canonicalTitle,popularityRank)=>({...anime,id,attributes:{...anime.attributes,canonicalTitle,popularityRank}});
    const result=await kitsuCatalog('kitsu-anime-list','gray',0,undefined,async()=>response({data:[record('1','D.Gray-man',900),record('2','Unrelated hit',3),record('3','Gray Area',null),record('4','Grayscale',12),record('5','Other',1)]}));
    expect(result.metas.map(m=>m.id)).toEqual(['kitsu:4','kitsu:1','kitsu:3','kitsu:2','kitsu:5']);
  });
});

it('ranks exact anime titles and aliases above more popular partial matches',async()=>{
 const record=(id,name,rank,titles={})=>({...anime,id,attributes:{...anime.attributes,canonicalTitle:name,popularityRank:rank,titles}});
 const result=await kitsuCatalog('kitsu-anime-list','From',0,undefined,async()=>response({data:[record('1','From the Stars',1),record('2','From',1000),record('3','Japanese title',2000,{en:'From'})]}));
 expect(result.metas.map(m=>m.id)).toEqual(['kitsu:2','kitsu:3','kitsu:1']);
});

describe('episode paging',()=>{
  const episode=number=>({type:'episodes',attributes:{number,relativeNumber:number,seasonNumber:1}});
  // A long-running show: every page after the first is requested together, within the shared limit.
  const longShow=(count,{fail}={})=>{
    let active=0,peak=0;const failed=new Set();
    const fetch=vi.fn(async url=>{
      if(!url.pathname.endsWith('/episodes'))return response({data:anime});
      const offset=Number(url.searchParams.get('page[offset]'));
      if(fail===offset&&!failed.has(offset)){failed.add(offset);return new Response('{}',{status:503});}
      active++;peak=Math.max(peak,active);
      await new Promise(resolve=>setTimeout(resolve,5));
      active--;
      const numbers=Array.from({length:Math.max(0,Math.min(20,count-offset))},(_,index)=>offset+index+1);
      return response({data:numbers.map(episode),meta:{count},links:offset+20<count?{next:'https://kitsu.io/ignored'}:{}});
    });
    return {fetch,peak:()=>peak};
  };
  it('requests every page after the first together, with only the fields it reads',async()=>{
    const show=longShow(1410);
    const meta=await kitsuMetadata('kitsu:12',undefined,show.fetch);
    expect(meta.videos).toHaveLength(1410);
    expect(meta.videos.map(v=>v.episode)).toEqual(Array.from({length:1410},(_,index)=>index+1));
    const pages=show.fetch.mock.calls.map(([url])=>url).filter(url=>url.pathname.endsWith('/episodes'));
    expect(pages).toHaveLength(71);
    expect(pages.every(url=>url.searchParams.get('fields[episodes]')==='number,relativeNumber,seasonNumber,canonicalTitle,airdate,thumbnail')).toBe(true);
    expect(show.peak()).toBeGreaterThan(1);expect(show.peak()).toBeLessThanOrEqual(8);
  });
  it('retries a page Kitsu drops once, so the season stays complete',async()=>{
    const show=longShow(45,{fail:20});
    const meta=await kitsuMetadata('kitsu:12',undefined,show.fetch);
    expect(meta.videos).toHaveLength(45);
  });
  // Pages answer after `ms`, or fail as soon as the request is cancelled.
  const slowPage=(url,init,ms,count)=>new Promise((resolve,reject)=>{
    const offset=Number(url.searchParams.get('page[offset]'));
    const timer=setTimeout(()=>{
      const numbers=Array.from({length:Math.max(0,Math.min(20,count-offset))},(_,index)=>offset+index+1);
      resolve(response({data:numbers.map(episode),meta:{count},links:offset+20<count?{next:'x'}:{}}));
    },ms);
    init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(Object.assign(new Error('cancelled'),{name:'AbortError'}));},{once:true});
  });
  it('serves the title page someone opened ahead of a background refresh',async()=>{
    const starts=[];
    const fetch=vi.fn(async(url,init)=>{
      const [,id,part]=/\/anime\/(\d+)(?:\/([a-z-]+))?$/.exec(url.pathname);
      // Background pages hold their slots for 200 ms, so the opened title's pages queue behind eleven of them.
      if(part==='episodes'){starts.push(id+':'+url.searchParams.get('page[offset]'));return id==='12'?slowPage(url,init,200,400):slowPage(url,init,5,60);}
      if(part==='media-relationships')return response({data:[]});
      return response({data:{...anime,id}});
    });
    const background=kitsuMetadata('kitsu:12',undefined,fetch);
    await vi.waitFor(()=>expect(starts.filter(start=>start.startsWith('12:')).length).toBeGreaterThanOrEqual(9));
    const opened=kitsuSeries('kitsu:7',undefined,fetch,()=>{});
    await Promise.all([background,opened]);
    // Without priority, the opened title's pages would wait for all eleven queued background pages.
    expect(starts.indexOf('7:20')).toBeLessThan(starts.indexOf('12:180'));
    expect(starts.indexOf('7:40')).toBeLessThan(starts.indexOf('12:200'));
  });
  it('stops a season\'s other pages when one fails twice, and frees the shared slots',async()=>{
    let pages=0;
    const fetch=vi.fn(async(url,init)=>{
      if(!url.pathname.endsWith('/episodes'))return response({data:anime});
      pages++;
      if(url.searchParams.get('page[offset]')==='60')return new Response('{}',{status:503});
      return slowPage(url,init,200,400);
    });
    await expect(kitsuMetadata('kitsu:12',undefined,fetch)).rejects.toThrow('HTTP 503');
    // Long enough for the queued pages to have started had they not been cancelled. Requested: the first page,
    // eight in flight, seven that started while page 60 waited to retry, and its retry. 17 of 21.
    await new Promise(resolve=>setTimeout(resolve,500));
    expect(pages).toBeLessThan(21);
    const after=await kitsuMetadata('kitsu:12',undefined,longShow(1410).fetch);
    expect(after.videos).toHaveLength(1410);
  });
  it('does not repeat a request Kitsu refuses',async()=>{
    const fetch=vi.fn(async()=>new Response('{}',{status:404}));
    await expect(kitsuMetadata('kitsu:12',undefined,fetch)).rejects.toThrow('HTTP 404');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it('uses only the Unicode property escapes the TV and Android builds can rewrite',()=>{
  // Their engines have no ICU: anything else fails on the device, not in these tests.
  const source=readFileSync(new URL('./kitsu.mjs',import.meta.url),'utf8').replaceAll(String.raw`/[^\p{L}\p{N}]+/gu`,'');
  expect(source).not.toMatch(/\\[pP]\{/);
});

describe('anime season titles',()=>{
  it.each([
    ['Attack on Titan Season 3 Part 2','Attack on Titan','Season 3 Part 2'],
    ['Attack on Titan: The Final Season Part 2','Attack on Titan','Final Season Part 2'],
    ['Attack on Titan: The Final Season - Final Chapters Part 1','Attack on Titan','Final Season Final Chapters Part 1'],
    ['Ansatsu Kyoushitsu 2nd Season','Ansatsu Kyoushitsu','Season 2'],
    ['Assassination Classroom Second Season','Assassination Classroom','Season 2'],
    ['Boku no Hero Academia 3','Boku no Hero Academia','Season 3'],
    ['Boku no Hero Academia FINAL SEASON','Boku no Hero Academia','Final Season'],
    ['Overlord III','Overlord','Season 3'],
    ['Re:ZERO -Starting Life in Another World- Season 4','Re:ZERO -Starting Life in Another World-','Season 4'],
    ['Demon Slayer: Kimetsu no Yaiba - Mugen Train Arc','Demon Slayer: Kimetsu no Yaiba','Mugen Train Arc'],
    ['Kimetsu no Yaiba: Yuukaku-hen','Kimetsu no Yaiba','Yuukaku-hen'],
  ])('reads %s',(title,base,label)=>{expect(parseSeasonTitle(title)).toEqual({base,label});});
  it.each(['Area 88','Mob Psycho 100','86','Lupin III','Hunter x Hunter (2011)','Fullmetal Alchemist: Brotherhood','Naruto: Shippuden','Steins;Gate 0'])('keeps %s whole',title=>{
    expect(parseSeasonTitle(title)).toEqual({base:title,label:undefined});
  });
  it('shows English names, keeps the canonical title for torrents and matches across languages',()=>{
    const meta=animeMeta({...anime,attributes:{canonicalTitle:'Shingeki no Kyojin Season 2',subtype:'TV',titles:{en:'Attack on Titan Season 2',en_jp:'Shingeki no Kyojin Season 2'},abbreviatedTitles:['SnK 2']}});
    expect(meta).toMatchObject({name:'Attack on Titan Season 2',originalName:'Shingeki no Kyojin Season 2',seriesName:'Attack on Titan',seasonLabel:'Season 2',seriesKeys:['shingekinokyojin','attackontitan']});
  });
});

describe('merged anime series',()=>{
  const record=(id,canonicalTitle,subtype,startDate,en)=>({id,type:'anime',attributes:{canonicalTitle,subtype,startDate,titles:en?{en}:{}}});
  const library={
    1:record('1','Kimetsu no Yaiba','TV','2019-04-06','Demon Slayer'),
    2:record('2','Kimetsu no Yaiba: Mugen Ressha-hen','movie','2020-10-16','Demon Slayer The Movie'),
    3:record('3','Kimetsu no Yaiba: Yuukaku-hen','TV','2021-12-05','Demon Slayer - Entertainment District Arc'),
    4:record('4','Kimetsu no Yaiba: Tsuzumi Hen','special','2021-01-01','Demon Slayer - Tsuzumi Arc'),
    5:record('5','Unrelated Spinoff','TV','2022-01-01'),
  };
  const links={1:[2,4],2:[1,3],3:[2,5],4:[1],5:[3]};
  const respond=(overrides={})=>async url=>{
    const path=url.pathname.replace('/api/edge/anime/','');
    if(overrides[path])return overrides[path]();
    const [id,part]=path.split('/');
    if(part==='media-relationships')return response({data:links[id].map(to=>({attributes:{role:'sequel'},relationships:{destination:{data:{type:'anime',id:String(to)}}}})),included:links[id].map(to=>library[to])});
    if(part==='episodes')return response({data:[{type:'episodes',attributes:{number:1,relativeNumber:1,seasonNumber:1}},{type:'episodes',attributes:{number:2,relativeNumber:2,seasonNumber:1}}].slice(0,library[id].attributes.subtype==='special'?1:2)});
    return response({data:library[id]});
  };
  it('joins seasons through a movie into one title, whichever season opens it',async()=>{
    for(const id of ['1','3','4']){
      const meta=await kitsuSeries(`kitsu:${id}`,undefined,respond());
      expect(meta).toMatchObject({id:'kitsu:1',name:'Demon Slayer'});
      expect([...meta.seasonIds].sort()).toEqual(['kitsu:1','kitsu:3','kitsu:4']);
      expect(meta.metadataPartial).toBeUndefined();
      expect(meta.videos.map(v=>[v.id,v.season,v.episode,v.seasonName])).toEqual([
        ['kitsu:1:1',1,1,undefined],['kitsu:1:2',1,2,undefined],
        ['kitsu:3:1',2,1,'Entertainment District Arc'],['kitsu:3:2',2,2,'Entertainment District Arc'],
        ['kitsu:4:1',0,1,undefined],
      ]);
    }
  });
  it('does not number a re-edit as the next season',async()=>{
    const cut=record('6','Kimetsu no Yaiba: Shin Henshuu','TV','2020-01-01','Demon Slayer - Director\'s Cut');
    cut.attributes.titles.en_jp='Kimetsu no Yaiba Season 2';
    const fetch=async url=>{
      const path=url.pathname.replace('/api/edge/anime/','');
      if(path==='1/media-relationships')return response({data:[{attributes:{role:'sequel'},relationships:{destination:{data:{type:'anime',id:'6'}}}}],included:[cut]});
      if(path==='6/media-relationships')return response({data:[]});
      if(path==='6/episodes')return response({data:[{type:'episodes',attributes:{number:1}}]});
      return respond()(url);
    };
    const meta=await kitsuSeries('kitsu:1',undefined,fetch);
    expect(meta.videos.find(v=>v.id==='kitsu:6:1').seasonName).toBe('Demon Slayer - Director\'s Cut'.replace('Demon Slayer - ',''));
  });
  it('names a one-episode special after its record and never includes movies or unrelated sequels',async()=>{
    const meta=await kitsuSeries('kitsu:1',undefined,respond());
    expect(meta.videos.at(-1).title).toBe('Demon Slayer - Tsuzumi Arc');
    expect(meta.videos.some(v=>/^kitsu:[25]:/.test(v.id))).toBe(false);
  });
  it('keeps a title usable and retryable when the relationship lookup fails',async()=>{
    const meta=await kitsuSeries('kitsu:1',undefined,respond({'1/media-relationships':()=>new Response('{}',{status:500})}));
    expect(meta).toMatchObject({id:'kitsu:1',metadataPartial:true,seasonIds:['kitsu:1']});
    expect(meta.videos).toHaveLength(2);
  });
  it('keeps the other seasons when one season fails, and retries later',async()=>{
    const meta=await kitsuSeries('kitsu:1',undefined,respond({'3/episodes':()=>new Response('{}',{status:500})}));
    expect(meta.metadataPartial).toBe(true);
    expect(meta.videos.map(v=>v.id)).toEqual(['kitsu:1:1','kitsu:1:2','kitsu:4:1']);
  });
  it('passes the opened season on before the other seasons are known, and loads it once',async()=>{
    const fetch=vi.fn(respond()),early=[];
    const meta=await kitsuSeries('kitsu:3',undefined,fetch,partial=>early.push(partial));
    expect(early).toHaveLength(1);
    expect(early[0]).toMatchObject({id:'kitsu:3',metadataPartial:true});
    expect(early[0].videos.map(v=>v.id)).toEqual(['kitsu:3:1','kitsu:3:2']);
    expect(meta).toMatchObject({id:'kitsu:1'});expect(meta.metadataPartial).toBeUndefined();
    expect(fetch.mock.calls.filter(([url])=>url.pathname.endsWith('/anime/3/episodes'))).toHaveLength(1);
  });
  it('returns movies unchanged without looking up sequels',async()=>{
    const fetch=vi.fn(respond());
    const meta=await kitsuSeries('kitsu:2',undefined,fetch);
    expect(meta.type).toBe('movie');expect(meta.videos).toBeUndefined();
    expect(fetch.mock.calls.some(([url])=>url.pathname.includes('media-relationships'))).toBe(false);
  });
});
