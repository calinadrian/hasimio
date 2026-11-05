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
  it('returns movies unchanged without looking up sequels',async()=>{
    const fetch=vi.fn(respond());
    const meta=await kitsuSeries('kitsu:2',undefined,fetch);
    expect(meta.type).toBe('movie');expect(fetch).toHaveBeenCalledTimes(1);
  });
});
