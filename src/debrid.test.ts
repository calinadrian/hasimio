import {describe,expect,it} from 'vitest';
import {debridHeaders,savedDebrid,validDebridKey} from './debrid';
import {rankSources,usableSource} from './stream-options';
import type {Stream} from './media';

const memory=(value:unknown)=>({getItem:()=>JSON.stringify(value)});

describe('debrid accounts',()=>{
  it('keeps only a known service with a plausible key',()=>{
    expect(savedDebrid(memory({provider:'realdebrid',key:'ABCDEFGH1234'}))).toEqual({provider:'realdebrid',key:'ABCDEFGH1234'});
    expect(savedDebrid(memory({provider:'unknown',key:'ABCDEFGH1234'}))).toBeUndefined();
    expect(savedDebrid(memory({provider:'realdebrid',key:'short'}))).toBeUndefined();
    expect(validDebridKey('has spaces in it')).toBe(false);
  });
  it('sends the account only with Torrentio searches through Hasimio’s service',()=>{
    const debrid={provider:'realdebrid',key:'ABCDEFGH1234'};
    expect(debridHeaders('/api/extensions/torrentio/manifest.json',debrid)).toEqual({'X-Hasimio-Debrid':'realdebrid=ABCDEFGH1234'});
    expect(debridHeaders('/api/extensions/piratebay/manifest.json',debrid)).toBeUndefined();
    expect(debridHeaders('https://torrentio.strem.fun/manifest.json',debrid)).toBeUndefined();
    expect(debridHeaders('/api/extensions/torrentio/manifest.json',null)).toBeUndefined();
  });
});

describe('choosing a debrid source',()=>{
  it('starts on a file the service already holds, and never on one it would still download',()=>{
    const torrent:Stream={name:'Torrentio 1080p',infoHash:'b'.repeat(40),quality:'1080p',seeders:300};
    const cached:Stream={name:'[RD+] Torrentio 720p',url:'https://example.com/a.mkv',quality:'720p',debrid:'cached'};
    const pending:Stream={name:'[RD download] Torrentio 1080p',url:'https://example.com/b.mkv',quality:'1080p',debrid:'uncached'};
    expect(usableSource(pending)).toBe(false);
    expect(rankSources([pending,torrent,cached],{preferredQuality:'Auto',audioLanguage:'',subtitleLanguage:'eng',autoSubtitles:false},'tt1')[0]).toBe(cached);
  });
});
