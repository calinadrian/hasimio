import {describe,it,expect,vi,afterEach} from 'vitest';
import {gzipSync} from 'node:zlib';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createTitleIndex,normalize,titleMeta,tvmazeEpisodes} from './title-index.mjs';

const tsv = (...lines) => gzipSync(lines.map(line=>line.join('\t')).join('\n')+'\n');
const datasets = {
  'title.ratings.tsv.gz':tsv(['tconst','averageRating','numVotes'],['tt1','8.1','50000'],['tt2','7.0','2000'],['tt3','9.0','30000'],['tt4','6.0','10'],['tt9','5.0','90000']),
  'title.episode.tsv.gz':tsv(['tconst','parentTconst','seasonNumber','episodeNumber'],['tt31','tt3','1','1'],['tt32','tt3','1','2'],['tt33','tt3','\\N','\\N'],['tt41','tt4','1','1']),
  'title.basics.tsv.gz':tsv(['tconst','titleType','primaryTitle','originalTitle','isAdult','startYear','endYear','runtimeMinutes','genres'],
    ['tt1','movie','Amélie','Amélie','0','2025','\\N','122','Comedy,Romance'],['tt2','movie','Old Film','Old Film','0','1990','\\N','\\N','\\N'],
    ['tt3','tvSeries','The Show','The Show','0','2024','\\N','50','Drama'],['tt31','tvEpisode','Pilot','Pilot','0','2024','\\N','50','Drama'],
    ['tt4','movie','Unrated','Unrated','0','2025','\\N','90','Drama'],['tt9','movie','Adult','Adult','1','2025','\\N','90','\\N']),
};
let dir,open;
afterEach(async()=>{await open?.close();open=undefined;if(dir)await rm(dir,{recursive:true,force:true});dir=undefined;});
async function index(tvmaze=()=>new Response('',{status:404})) {
  dir=await mkdtemp(path.join(tmpdir(),'hasimio-titles-'));
  const fetchImpl=vi.fn(async url=>{const href=String(url);const name=href.split('/').at(-1);return href.startsWith('https://datasets.imdbws.com/')?new Response(datasets[name]):tvmaze(href);});
  const titles=createTitleIndex({dir,fetchImpl,now:()=>Date.parse('2026-10-28T00:00:00Z')});open=titles;
  return {titles,fetchImpl};
}

describe('Hasimio title index',()=>{
  it('explains that the index is building, then serves ranked catalogs without adult or rarely rated titles',async()=>{
    const {titles}=await index();
    await expect(titles.catalog('movie','popular')).rejects.toMatchObject({status:503});
    await titles.refresh();
    expect(titles.status()).toEqual({state:'ready'});
    const popular=await titles.catalog('movie','popular');
    expect(popular.metas.map(m=>m.id)).toEqual(['tt1']);
    expect(popular.metas[0]).toEqual({id:'tt1',type:'movie',name:'Amélie',releaseInfo:'2025',imdbRating:'8.1',genres:['Comedy','Romance'],runtime:'122 min'});
    expect((await titles.catalog('movie','top-rated')).metas.map(m=>m.id)).toEqual(['tt1']);
    expect((await titles.catalog('movie','popular',{search:'amelie'})).metas.map(m=>m.id)).toEqual(['tt1']);
    expect((await titles.catalog('movie','popular',{search:'%_'})).metas.map(m=>m.id)).toEqual(['tt1']);
    expect((await titles.catalog('movie','popular',{search:'missing'})).metas).toEqual([]);
    expect((await titles.title('tt2')).name).toBe('Old Film');
    await expect(titles.title('tt9')).rejects.toMatchObject({status:404});
    await titles.close();
  });
  it('falls back to IMDb episodes when TVmaze does not know a series',async()=>{
    const {titles}=await index();await titles.refresh();
    const {meta}=await titles.meta('series','tt3');
    expect(meta).toMatchObject({name:'The Show',releaseInfo:'2024–'});
    expect(meta.videos).toEqual([{id:'tt3:1:1',season:1,episode:1,title:'Pilot'},{id:'tt3:1:2',season:1,episode:2,title:undefined}]);
    await titles.close();
  });
  it('finds grey, apostrophe variants and out-of-order words in an existing title index',async()=>{
    const {titles}=await index();await titles.refresh();await titles.close();
    const {DatabaseSync}=await import('node:sqlite');
    const db=new DatabaseSync(path.join(dir,'titles.db'));
    db.prepare('UPDATE titles SET name=?,search=? WHERE id=?').run("Grey's Anatomy",normalize("Grey's Anatomy"),'tt3');db.close();
    const restarted=createTitleIndex({dir,fetchImpl:async()=>new Response('',{status:404}),now:()=>Date.parse('2026-10-28T00:00:00Z')});open=restarted;
    for(const search of ['grey',"Grey's Anatomy",'Grey’s Anatomy','greys anatomy','anatomy grey','grey anatomy']){
      expect((await restarted.catalog('series','popular',{search})).metas.map(m=>m.id),search).toEqual(['tt3']);
    }
    expect((await restarted.catalog('series','popular',{search:'grey unrelated'})).metas).toEqual([]);
  });
  it('lists the most popular search matches first, ahead of mid-word matches',async()=>{
    const {titles}=await index();await titles.refresh();await titles.close();
    const {DatabaseSync}=await import('node:sqlite');
    const db=new DatabaseSync(path.join(dir,'titles.db')),add=db.prepare('INSERT INTO titles(id,type,name,search,start,votes) VALUES(?,?,?,?,?,?)');
    for(const [id,name,votes] of [['tt50','Dune',150000],['tt51','Dune: Part Two',600000],['tt52','Dune',900000],['tt53','Spirited Away',800000],['tt54','It',500000],['tt55','It Follows',250000]])add.run(id,'movie',name,normalize(name),2020,votes);
    db.close();
    const restarted=createTitleIndex({dir,fetchImpl:async()=>new Response('',{status:404}),now:()=>Date.parse('2026-10-28T00:00:00Z')});open=restarted;
    const search=async(text)=>(await restarted.catalog('movie','popular',{search:text})).metas.map(m=>m.id);
    expect(await search('dune')).toEqual(['tt52','tt51','tt50']);
    expect(await search('it')).toEqual(['tt54','tt55','tt53']);
  });
  it('adds TVmaze artwork, summaries and air dates to series',async()=>{
    const {titles,fetchImpl}=await index(href=>new Response(JSON.stringify(href.includes('/lookup/shows?imdb=tt3')
      ?{id:7,image:{original:'https://static.tvmaze.com/poster.jpg'},summary:'<p>A <b>show</b> &amp; more.</p>'}
      :[{season:1,number:1,name:'Pilot',airdate:'2024-01-02',image:{medium:'https://static.tvmaze.com/e1.jpg'}},{season:1,number:null,name:'Special'}])));
    await titles.refresh();
    const {meta}=await titles.meta('series','tt3');
    expect(meta).toMatchObject({poster:'https://static.tvmaze.com/poster.jpg',description:'A show & more.'});
    expect(meta.videos).toEqual([{id:'tt3:1:1',season:1,episode:1,title:'Pilot',released:'2024-01-02',thumbnail:'https://static.tvmaze.com/e1.jpg'}]);
    expect((await titles.catalog('series','popular')).metas[0].poster).toBe('https://static.tvmaze.com/poster.jpg');
    expect(fetchImpl.mock.calls.filter(([url])=>String(url).includes('/lookup/')).length).toBe(1);
    await titles.close();
    // Artwork is remembered on disk across engine restarts.
    const restarted=createTitleIndex({dir,fetchImpl,now:()=>Date.parse('2026-10-28T00:00:00Z')});open=restarted;
    expect((await restarted.catalog('series','popular')).metas[0].poster).toBe('https://static.tvmaze.com/poster.jpg');
    expect(fetchImpl.mock.calls.filter(([url])=>String(url).includes('/lookup/')).length).toBe(1);
  });
  it('adds Wikipedia posters and summaries to movies, caching misses and stripping tracking parameters',async()=>{
    const {titles,fetchImpl}=await index(href=>{
      const url=new URL(href);
      if (url.hostname === 'query.wikidata.org') {
        expect(url.searchParams.get('query')).toContain('"tt1"');
        return new Response(JSON.stringify({results:{bindings:[{imdb:{value:'tt1'},article:{value:'https://en.wikipedia.org/wiki/Am%C3%A9lie_(film)'}},{imdb:{value:'tt1'},article:{value:'https://evil.example/wiki/Other'}}]}}));
      }
      if (url.hostname === 'en.wikipedia.org' && url.searchParams.get('prop') === 'pageimages') {
        expect(url.searchParams.get('titles')).toBe('Amélie (film)');expect(url.searchParams.get('pilicense')).toBe('any');
        return new Response(JSON.stringify({query:{redirects:[{from:'Amélie (film)',to:'Amélie'}],pages:[{title:'Amélie',thumbnail:{source:'https://upload.wikimedia.org/wikipedia/en/a/a1/Amelie.jpg?utm_source=en.wikipedia.org'}}]}}));
      }
      if (url.hostname === 'en.wikipedia.org') return new Response(JSON.stringify({query:{pages:[{title:'Amélie',extract:'Amélie is a 2001 film.'}]}}));
      return new Response('',{status:404});
    });
    await titles.refresh();
    expect((await titles.catalog('movie','popular')).metas[0].poster).toBe('https://upload.wikimedia.org/wikipedia/en/a/a1/Amelie.jpg');
    const {meta}=await titles.meta('movie','tt1');
    expect(meta).toMatchObject({poster:'https://upload.wikimedia.org/wikipedia/en/a/a1/Amelie.jpg',description:'Amélie is a 2001 film.'});
    await titles.meta('movie','tt1');await titles.catalog('movie','top-rated');
    const wikimedia=fetchImpl.mock.calls.map(([url])=>new URL(String(url))).filter(url=>url.hostname.endsWith('wikidata.org')||url.hostname.endsWith('wikipedia.org'));
    expect(wikimedia.map(url=>url.searchParams.get('prop') ?? 'sparql')).toEqual(['sparql','pageimages','extracts']);
    expect(fetchImpl.mock.calls.find(([url])=>String(url).includes('wikidata'))[1].headers['User-Agent']).toContain('Hasimio');
  });
  it('rejects movie posters from hosts other than Wikimedia uploads',async()=>{
    const {titles}=await index(href=>new URL(href).hostname === 'query.wikidata.org'
      ? new Response(JSON.stringify({results:{bindings:[{imdb:{value:'tt1'},article:{value:'https://en.wikipedia.org/wiki/Am%C3%A9lie'}}]}}))
      : new Response(JSON.stringify({query:{pages:[{title:'Amélie',thumbnail:{source:'https://tracker.example/a.jpg'}}]}})));
    await titles.refresh();
    expect((await titles.catalog('movie','popular')).metas[0].poster).toBeUndefined();
  });
  it('shows a single year for series that started and ended in the same year',()=>{
    expect(titleMeta({id:'tt1',type:'series',name:'Mini',start:2024,end:2024}).releaseInfo).toBe('2024');
    expect(titleMeta({id:'tt1',type:'series',name:'Show',start:2020,end:2023}).releaseInfo).toBe('2020–2023');
    expect(titleMeta({id:'tt1',type:'series',name:'Show',start:2020,end:null}).releaseInfo).toBe('2020–');
  });
  it('normalizes search text and rejects unsafe episode data',()=>{
    expect(normalize('  Amélie: Part II! ')).toBe('amelie part ii');
    expect(tvmazeEpisodes('tt1',[{season:1,number:2,airdate:'not a date',image:{medium:'http://insecure.example/x.jpg'}}])).toEqual([{id:'tt1:1:2',season:1,episode:2,title:undefined,released:undefined,thumbnail:undefined}]);
    expect(()=>tvmazeEpisodes('tt1',{})).toThrow();
    expect(tvmazeEpisodes('tt1',[{season:1,number:3,airdate:'2026-11-05',airstamp:'2026-11-05T01:00:00+00:00'}])[0].released).toBe('2026-11-05T01:00:00.000Z');
  });
});
