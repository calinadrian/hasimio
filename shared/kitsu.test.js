import {describe,it,expect,vi} from 'vitest';
import {animeMeta,kitsuCatalog,kitsuMetadata} from './kitsu.mjs';

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
});
