import {describe,expect,it} from 'vitest';
import {parseDebrid,debridTag,stremioResults,searchStremioSource} from './stremio-sources.mjs';

describe('the playback service with debrid',()=>{
  it('reads the account header and ignores anything else',()=>{
    expect(parseDebrid('alldebrid=KEY_1234-abcd')).toEqual({provider:'alldebrid',key:'KEY_1234-abcd'});
    expect(parseDebrid('evil=ABCDEFGH1234')).toBeUndefined();
    expect(parseDebrid('realdebrid=../../etc')).toBeUndefined();
    expect(parseDebrid(undefined)).toBeUndefined();
    // Searches are cached per account, without the key itself in the cache key.
    expect(debridTag(parseDebrid('realdebrid=ABCDEFGH1234'))).not.toContain('ABCDEFGH1234');
  });
  it('asks Torrentio with the account as a path option, as Stremio does',async()=>{
    let asked='';
    const fetchImpl=(async url=>{asked=String(url);return new Response(JSON.stringify({streams:[]}));});
    await searchStremioSource('torrentio','movie','tt1160419',fetchImpl,{provider:'realdebrid',key:'ABCDEFGH1234'});
    expect(asked).toBe('https://torrentio.strem.fun/realdebrid=ABCDEFGH1234/stream/movie/tt1160419.json');
    await searchStremioSource('torrentio','movie','tt1160419',fetchImpl);
    expect(asked).toBe('https://torrentio.strem.fun/stream/movie/tt1160419.json');
  });
  it('marks files the service holds and ones it would still download',()=>{
    const {streams}=stremioResults({streams:[
      {name:'[RD+] Torrentio\n1080p',url:'https://torrentio.strem.fun/resolve/realdebrid/k/a'},
      {name:'[RD download] Torrentio\n4k',url:'https://torrentio.strem.fun/resolve/realdebrid/k/b'},
      {name:'Torrentio\n720p',infoHash:'a'.repeat(40)},
    ]},'Torrentio');
    expect(streams.map(stream=>stream.debrid)).toEqual(['cached','uncached',undefined]);
  });
});
