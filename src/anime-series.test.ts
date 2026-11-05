import {describe,expect,it} from 'vitest';
import {groupAnimeSeries,imdbAnimeMatch,mergeImdbAnime,sameTitle,updateTitle} from './anime-series';
import {canonicalHistory} from './playback-progress';
import type {Meta} from './media';

const anime=(id:string,name:string,seriesName:string,seriesKeys:string[],seasonLabel?:string,releaseInfo?:string):Meta=>({id,type:'series',category:'anime',name,seriesName,seriesKeys,seasonLabel,releaseInfo});
describe('anime shelf grouping',()=>{
  const first=anime('kitsu:1','Attack on Titan','Attack on Titan',['attackontitan','shingekinokyojin']);
  const second=anime('kitsu:2','Attack on Titan Season 2','Attack on Titan',['attackontitan','shingekinokyojin'],'Season 2');
  it('shows one card per series, using the first season, in the earliest position',()=>{
    const other=anime('kitsu:9','Death Note','Death Note',['deathnote']);
    expect(groupAnimeSeries([second,other,first]).map(m=>[m.id,m.name])).toEqual([['kitsu:1','Attack on Titan'],['kitsu:9','Death Note']]);
  });
  it('joins an English record and a Japanese record through a title that carries both names',()=>{
    const english=anime('kitsu:1','My Hero Academia','My Hero Academia',['myheroacademia']);
    const japanese=anime('kitsu:2','Boku no Hero Academia 3','Boku no Hero Academia',['bokunoheroacademia'],'Season 3');
    const both=anime('kitsu:3','My Hero Academia Season 2','My Hero Academia',['myheroacademia','bokunoheroacademia'],'Season 2');
    expect(groupAnimeSeries([english,japanese,both]).map(m=>m.id)).toEqual(['kitsu:1']);
  });
  it('removes the season from a card whose first season is not on the shelf',()=>{
    const later=anime('kitsu:4','Re:ZERO Season 4','Re:ZERO',['rezero'],'Season 4','2026');
    const earlier=anime('kitsu:3','Re:ZERO Season 3','Re:ZERO',['rezero'],'Season 3','2024');
    expect(groupAnimeSeries([later,earlier])).toMatchObject([{id:'kitsu:3',name:'Re:ZERO'}]);
    expect(groupAnimeSeries([later])).toMatchObject([{id:'kitsu:4',name:'Re:ZERO'}]);
  });
  it('keeps remakes with the same name, movies, and other catalogs apart',()=>{
    const remake=anime('kitsu:5','Dororo','Dororo',['dororo'],undefined,'1969'),original=anime('kitsu:6','Dororo','Dororo',['dororo'],undefined,'2019');
    expect(groupAnimeSeries([remake,original])).toHaveLength(2);
    const movie={...first,id:'kitsu:7',type:'movie'};
    expect(groupAnimeSeries([first,movie])).toHaveLength(2);
    const arcMovie={...anime('kitsu:8','Series - Big Arc','Series',['series'],'Big Arc'),type:'movie'};
    expect(groupAnimeSeries([arcMovie])[0].name).toBe('Series - Big Arc');
    const special={...anime('kitsu:10','Attack on Titan - Side Arc','Attack on Titan',['attackontitan'],'Side Arc'),animeFormat:'special'};
    expect(groupAnimeSeries([first,special]).map(m=>m.name)).toEqual(['Attack on Titan','Attack on Titan - Side Arc']);
    const imdb:Meta={id:'tt1',type:'series',name:'Attack on Titan'};
    expect(groupAnimeSeries([first,imdb])).toEqual([first,imdb]);
  });
});
describe('IMDb entries for anime',()=>{
  const titan=anime('kitsu:1','Attack on Titan','Attack on Titan',['attackontitan','shingekinokyojin'],undefined,'2013');
  const imdb:Meta={id:'tt2560140',type:'series',name:'Attack on Titan',aliases:['Shingeki no Kyojin'],releaseInfo:'2013–2023',genres:['Animation','Action']};
  it('matches by name and start year, in either language',()=>{
    expect(imdbAnimeMatch(imdb,[titan])).toBe(titan);
    expect(imdbAnimeMatch({...imdb,name:'Shingeki no Kyojin',aliases:undefined},[titan])).toBe(titan);
    const later=anime('kitsu:2','Attack on Titan Season 3','Attack on Titan',['attackontitan'],'Season 3','2018');
    expect(imdbAnimeMatch(imdb,[later])).toBe(later);
    expect(imdbAnimeMatch(imdb,[later,titan])).toBe(titan);
  });
  it('leaves live-action shows, remakes and non-IMDb entries alone',()=>{
    const onePiece=anime('kitsu:12','One Piece','One Piece',['onepiece'],undefined,'1999');
    const live:Meta={id:'tt11737520',type:'series',name:'One Piece',releaseInfo:'2023–',genres:['Action','Adventure']};
    expect(imdbAnimeMatch(live,[onePiece])).toBeUndefined();
    expect(imdbAnimeMatch({...live,genres:['Animation']},[onePiece])).toBeUndefined();
    expect(imdbAnimeMatch({...imdb,genres:undefined},[titan])).toBeUndefined();
    expect(imdbAnimeMatch({...imdb,id:'kitsu:9'},[titan])).toBeUndefined();
    expect(imdbAnimeMatch({...imdb,releaseInfo:undefined},[titan])).toBeUndefined();
  });
  it('replaces the card in place, or removes it when the anime is already on the shelf',()=>{
    const other:Meta={id:'tt1',type:'series',name:'Other'};
    const merged=mergeImdbAnime([other,imdb],[titan]);
    expect(merged.map(m=>m.id)).toEqual(['tt1','kitsu:1']);
    expect(merged[1].genres).toEqual(imdb.genres);
    expect(groupAnimeSeries(mergeImdbAnime([titan,other,imdb],[titan])).map(m=>m.id)).toEqual(['kitsu:1','tt1']);
  });
  it('keeps an IMDb entry the user has saved or started',()=>{
    expect(mergeImdbAnime([imdb],[titan],()=>true)).toEqual([imdb]);
  });
  it('treats the anime opened from an IMDb card as that same title',()=>{
    expect(sameTitle({...titan,imdbIds:[imdb.id]},imdb)).toBe(true);
    expect(sameTitle(titan,imdb)).toBe(false);
  });
});
describe('merged anime identity',()=>{
  const merged:Meta={id:'kitsu:1',type:'series',name:'Series',seasonIds:['kitsu:1','kitsu:2']};
  const season:Meta={id:'kitsu:2',type:'series',name:'Series Season 2'};
  it('treats a season and its series as the same title',()=>{
    expect(sameTitle(merged,season)).toBe(true);
    expect(sameTitle(merged,{...season,type:'movie'})).toBe(false);
  });
  it('replaces every older entry once, keeping list order',()=>{
    const other:Meta={id:'kitsu:9',type:'series',name:'Other'};
    expect(updateTitle([other,season,{...merged,name:'Old'}],merged)).toEqual([other,merged]);
    expect(updateTitle([other],merged)).toEqual([other]);
  });
  it('counts progress saved against a season toward the series without changing the stored map',()=>{
    const entry={position:1,duration:2,updatedAt:3,completed:false,titleKey:'series:kitsu:2',videoId:'kitsu:2:4'};
    const history={'series:kitsu:2:4':entry};
    expect(canonicalHistory(history,[merged])['series:kitsu:2:4'].titleKey).toBe('series:kitsu:1');
    expect(entry.titleKey).toBe('series:kitsu:2');
    expect(canonicalHistory(history,[])).toBe(history);
  });
});
