import {describe,expect,it} from 'vitest';
import type {Meta} from './media';
import {featuredCandidates,popularRow} from './featured';
import {backdropSources,knownImage,logoSource} from './poster-artwork';

const title=(id:string,type='movie',extra:Partial<Meta>={}):Meta=>({id,type,name:id,...extra});
const row=(type:string,id:string,items:Meta[])=>({catalog:{type,id},items});

describe('billboard candidates',()=>{
  const movies=row('movie','popular',[title('tt1'),title('tt2'),title('tt3')]);
  const series=row('series','popular',[title('tt11','series'),title('tt12','series')]);
  it('alternates the most popular movies and series',()=>{
    expect(featuredCandidates([movies,series],0).map(meta=>meta.id)).toEqual(['tt1','tt11','tt2','tt12','tt3']);
  });
  it('moves its starting point along each day and wraps around',()=>{
    expect(featuredCandidates([movies,series],1).map(meta=>meta.id)).toEqual(['tt11','tt2','tt12','tt3','tt1']);
    expect(featuredCandidates([movies,series],5)[0].id).toBe('tt1');
  });
  it('adds other catalogs only for titles with their own artwork and description, once each',()=>{
    const anime=row('anime','trending',[title('kitsu:1','anime',{background:'https://kitsu.test/1.jpg',description:'An anime.'}),title('kitsu:2','anime',{background:'https://kitsu.test/2.jpg'}),title('kitsu:3','anime')]);
    const again=row('movie','top-rated',[title('tt1')]);
    expect(featuredCandidates([movies,anime,again],0).map(meta=>meta.id)).toEqual(['tt1','tt2','tt3','kitsu:1']);
  });
  it('has nothing to offer before the catalogs load',()=>{
    expect(featuredCandidates([],3)).toEqual([]);
  });
  it('falls back to Cinemeta’s popular catalog',()=>{
    const top=row('movie','top',[title('tt9')]);
    expect(popularRow([top],'movie')).toBe(top);
    expect(popularRow([top,movies],'movie')).toBe(movies);
    expect(popularRow([top],'series')).toBeUndefined();
  });
});

describe('wide artwork and logos',()=>{
  it('tries the provider’s background first, then Metahub’s by IMDb ID',()=>{
    expect(backdropSources({id:'tt5',background:'https://art.test/b.jpg'})).toEqual(['https://art.test/b.jpg','https://images.metahub.space/background/medium/tt5/img']);
    expect(backdropSources({id:'tt5'},'small')).toEqual(['https://images.metahub.space/background/small/tt5/img']);
    expect(backdropSources({id:'kitsu:5',background:'javascript:alert(1)'})).toEqual([]);
  });
  it('offers logos only for IMDb titles',()=>{
    expect(logoSource({id:'tt5'})).toBe('https://images.metahub.space/logo/medium/tt5/img');
    expect(logoSource({id:'kitsu:5'})).toBeUndefined();
  });
  it('reports nothing known for artwork it has not checked yet',()=>{
    expect(knownImage(['https://art.test/never-checked.jpg'])).toEqual({settled:false});
    expect(knownImage([])).toEqual({settled:true});
  });
});
