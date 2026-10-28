import {describe,it,expect} from 'vitest';
import {describeStream,availableQualities,defaultQuality,sortSources,bestSource} from './stream-options';
import {detectQuality} from '../shared/stream-info.mjs';
import {torrentResults} from '../server/piratebay.mjs';
describe('quality-first stream selection',()=>{
  it('distinguishes 720p, 1080p, 1440p and 2160p without advertising unavailable tiers',()=>{
    const options=['Film.720p.x264','Film.1080p.x265','Film.2160p.HEVC'].map(title=>describeStream({title}));
    expect(availableQualities(options)).toEqual(['720p','1080p','4K']);expect(defaultQuality(availableQualities(options))).toBe('1080p');
    expect(detectQuality('Film.1440p.WEB-DL')).toBe('2K');expect(detectQuality('Film.2560x1440')).toBe('2K');expect(detectQuality('1080p')).not.toBe('2K');
  });
  it('keeps unknown direct video quality explicitly unspecified',()=>{const option=describeStream({name:'Open Cinema',url:'https://example.org/movie.mp4'});expect(option.quality).toBe('Other');expect(option.sizeBytes).toBeUndefined();});
  it('retains a separately supplied filename and reads its resolution and codec',()=>{const option=describeStream({filename:'Film.2160p.HEVC.mkv',title:'Preferred source'});expect(option.detail).toBe('Film.2160p.HEVC.mkv\nPreferred source');expect(option.quality).toBe('4K');expect(option.codec).toBe('HEVC');});
  it('uses structured metadata and supports older add-on text responses',()=>{
    expect(describeStream({quality:'4K',seeders:50,sizeBytes:100,provider:'An extension',title:'Film.1080p'})).toMatchObject({quality:'4K',seeders:50,sizeBytes:100,provider:'An extension'});
    expect(describeStream({name:'The Pirate Bay · 1080p',title:'Film.WEBRip.x264\n3,132 seeders · 2.0 GB'})).toMatchObject({quality:'1080p',seeders:3132,sizeBytes:2*1024**3,codec:'H.264',release:'WEBRip'});
  });
  it('sorts by real source data with missing sizes last',()=>{const sources=[describeStream({seeders:2,sizeBytes:900}),describeStream({seeders:8,sizeBytes:300}),describeStream({})];expect(sortSources(sources,'seeders')[0].seeders).toBe(8);expect(sortSources(sources,'size').at(-1)?.sizeBytes).toBeUndefined();});
  it('retains lower-seeded quality tiers instead of truncating them behind all 1080p sources',()=>{
    const rows=Array.from({length:24},(_,i)=>({info_hash:i.toString(16).padStart(40,'0'),name:'Film.1080p',category:'201',seeders:String(100-i),size:'100'}));rows.push({info_hash:'f'.repeat(40),name:'Film.2160p',category:'201',seeders:'1',size:'1000'});
    const result=torrentResults(rows,'tt123');expect(result.filter(r=>r.quality==='1080p')).toHaveLength(8);expect(result.some(r=>r.quality==='4K')).toBe(true);
  });
  it('plays the most-seeded default-quality source and skips unplayable entries',()=>{
    const hash=(c:string)=>c.repeat(40);
    expect(bestSource([{infoHash:hash('a'),quality:'4K',seeders:90},{infoHash:hash('b'),quality:'1080p',seeders:5},{infoHash:hash('c'),quality:'1080p',seeders:40},{externalUrl:'https://example.org',quality:'1080p'}])?.infoHash).toBe(hash('c'));
    expect(bestSource([{infoHash:hash('d'),quality:'720p',seeders:0},{url:'https://example.org/a.mp4',quality:'720p'}])?.url).toBe('https://example.org/a.mp4');
    expect(bestSource([{externalUrl:'https://example.org'}])).toBeUndefined();
  });
});
