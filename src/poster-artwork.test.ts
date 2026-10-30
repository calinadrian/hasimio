import {describe,it,expect} from 'vitest';
import {posterSources} from './poster-artwork';

describe('poster recovery',()=>{
  const backup='https://images.metahub.space/poster/medium/tt31314751/img';
  it('offers a backup for missing covers, including old library entries',()=>{
    expect(posterSources({id:'tt31314751'})).toEqual([backup]);
  });
  it('keeps provider artwork first and offers an independent backup',()=>{
    expect(posterSources({id:'tt31314751',poster:'https://static.tvmaze.com/cover.jpg'})).toEqual(['https://static.tvmaze.com/cover.jpg',backup]);
  });
  it('does not retry the same failed URL or guess IMDb IDs for other providers',()=>{
    expect(posterSources({id:'tt31314751',poster:backup})).toEqual([backup]);
    expect(posterSources({id:'kitsu:123'})).toEqual([]);
    expect(posterSources({id:'tt1/other'})).toEqual([]);
  });
  it('discards unsafe provider URLs while retaining a usable backup',()=>{
    expect(posterSources({id:'tt31314751',poster:'javascript:alert(1)'})).toEqual([backup]);
  });
});
