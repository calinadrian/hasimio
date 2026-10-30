import {it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createActorPhotos,lookupActorPhotos} from './people-photos.mjs';
const response=value=>new Response(JSON.stringify(value));
function source(){return vi.fn(async url=>String(url).startsWith('https://query.wikidata.org/')?response({results:{bindings:[
  {imdb:{value:'nm1'},image:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/Actor_photo.jpg'}},
  {imdb:{value:'nm999'},image:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/Other.jpg'}},
  {imdb:{value:'nm2'},image:{value:'https://evil.invalid/wiki/Special:FilePath/Other.jpg'}},
]}}):response({query:{normalized:[{from:'File:Actor_photo.jpg',to:'File:Actor photo.jpg'}],pages:[{title:'File:Actor photo.jpg',imageinfo:[{thumburl:'https://upload.wikimedia.org/actor.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Actor_photo.jpg',extmetadata:{Artist:{value:'<a href="evil">Photographer</a>'},LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'}}}]}]}}));}
it('matches the exact IMDb identity and retains safe photo attribution',async()=>{
  const fetchImpl=source(),photos=await lookupActorPhotos(['nm1','nm2'],{fetchImpl});
  expect(Object.keys(photos)).toEqual(['nm1']);
  expect(photos.nm1).toMatchObject({image:'https://upload.wikimedia.org/actor.jpg',credit:'Photographer',license:'CC BY-SA 4.0'});
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  await expect(lookupActorPhotos(['nm1" injected'],{fetchImpl})).rejects.toThrow('Invalid');
});
it('rejects unexpected image hosts',async()=>{
  const fetchImpl=source();fetchImpl.mockImplementationOnce(()=>response({results:{bindings:[{imdb:{value:'nm1'},image:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/Actor_photo.jpg'}}]}}));
  fetchImpl.mockImplementationOnce(()=>response({query:{pages:[{title:'File:Actor_photo.jpg',imageinfo:[{thumburl:'https://evil.invalid/photo.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Actor_photo.jpg'}]}]}}));
  expect(await lookupActorPhotos(['nm1'],{fetchImpl})).toEqual({});
});
it('deduplicates lookups, caches photos and misses across restarts without rebuilding cast data',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'hasimio-photos-')),fetchImpl=source();let index=createActorPhotos({dir,fetchImpl});
  try{
    const [a,b]=await Promise.all([index.photos(['nm1','nm2']),index.photos(['nm1'])]);
    expect(a.photos.nm1).toEqual(b.photos.nm1);expect(fetchImpl).toHaveBeenCalledTimes(2);
    await index.close();index=createActorPhotos({dir,fetchImpl});
    expect((await index.photos(['nm1','nm2'])).photos.nm1.image).toContain('upload.wikimedia.org');expect(fetchImpl).toHaveBeenCalledTimes(2);
  }finally{await index.close();await rm(dir,{recursive:true,force:true});}
});
