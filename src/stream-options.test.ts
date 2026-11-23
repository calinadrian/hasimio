import {saveTrackSummary} from './playback-tracks';
import {describe,it,expect} from 'vitest';
import {describeStream,availableQualities,defaultQuality,sortSources,bestSource} from './stream-options';
import {detectQuality} from '../shared/stream-info.mjs';
import {torrentResults} from '../server/piratebay.mjs';
import {releaseAudio} from './release-languages';
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
    // A size inside the release name once read as ".1400 MB" = 0 MB.
    expect(describeStream({name:'Torrentio\n1080p',title:'Deadpool.and.Wolverine.2024.1080p.AMZN.WEBRip.1400MB.DD5.1.x264-GalaxyRG\n👤 931 💾 1.4 GB ⚙️ 1337x'}).sizeBytes).toBeCloseTo(1.4*1024**3);
    expect(describeStream({name:'Source',title:'Film.WEBRip.1400MB.x264'}).sizeBytes).toBe(1400*1024**2);
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

describe('preferred playback languages',()=>{
  const preferences={audioLanguage:'ro',subtitleLanguage:'eng',autoSubtitles:true,preferredQuality:'1080p'} as const;
  const dub={index:0,language:'ron',codec:'aac',default:false};
  const subtitles={index:0,language:'en',codec:'subrip',default:false,supported:true};
  it('picks the confirmed dub across qualities and never associates another file with the requested one',()=>{
    const videoId='tt-language:1:2';
    const lower={infoHash:'1'.repeat(40),fileIdx:4,quality:'720p',seeders:5};
    const higher={infoHash:'2'.repeat(40),quality:'1080p',seeders:50};
    saveTrackSummary(lower.infoHash,videoId,[dub],[],4,4);
    expect(bestSource([higher,lower],preferences,videoId)).toBe(lower);
    expect(bestSource([higher,{...lower,fileIdx:5}],preferences,videoId)).toBe(higher);
    expect(bestSource([higher,lower],preferences,'tt-language:1:3')).toBe(higher);
    expect(bestSource([higher,{...lower,seeders:0}],preferences,videoId)).toBe(higher);
  });
  it('uses playable subtitles after audio, and quality when subtitles are off or unsupported',()=>{
    const videoId='tt-subtitle';
    const lower={infoHash:'3'.repeat(40),quality:'720p',seeders:4};
    const higher={infoHash:'4'.repeat(40),quality:'1080p',seeders:50};
    saveTrackSummary(lower.infoHash,videoId,[],[subtitles]);
    expect(bestSource([higher,lower],preferences,videoId)).toBe(lower);
    expect(bestSource([higher,lower],{...preferences,autoSubtitles:false},videoId)).toBe(higher);
    saveTrackSummary(lower.infoHash,videoId,[],[{...subtitles,supported:false}]);
    expect(bestSource([higher,lower],preferences,videoId)).toBe(higher);
  });
});

describe('preferred audio from release names',()=>{
  const english={audioLanguage:'eng',subtitleLanguage:'eng',autoSubtitles:false,preferredQuality:'1080p'} as const;
  const hash=(n:number)=>String(n).repeat(40);
  it('reads Torrentio flags and scene tags',()=>{
    expect(releaseAudio('Film.2024.1080p\n👤 50 💾 2 GB ⚙️ ThePirateBay\n🇮🇹').languages).toEqual(['it']);
    expect(releaseAudio('Film.2024.iTALiAN.1080p.WEB').languages).toEqual(['it']);
    expect(releaseAudio('Film.2024.1080p.iTA-ENG.WEB').languages.sort()).toEqual(['en','it']);
    expect(releaseAudio('Film.2024.1080p.WEB.ENG.SUBS').languages).toEqual([]);
    expect(releaseAudio('Film.2024.MULTi.1080p').multi).toBe(true);
    expect(releaseAudio('Film.2024.1080p.Multi.Subs').multi).toBe(false);
    expect(releaseAudio('Film.2024.1080p.WEB-DL.x264').languages).toEqual([]);
  });
  it('plays a likely English release before a better-seeded dub, and the dub when nothing else exists',()=>{
    const italian={infoHash:hash(5),title:'Film.2024.iTALiAN.1080p.WEB',quality:'1080p',seeders:900};
    const french={infoHash:hash(6),title:'Film 2024 1080p\n🇫🇷',quality:'1080p',seeders:500};
    const plain={infoHash:hash(7),title:'Film.2024.1080p.WEB-DL',quality:'1080p',seeders:20};
    const tagged={infoHash:hash(8),title:'Film.2024.720p.ENG',quality:'720p',seeders:3};
    expect(bestSource([italian,french,plain],english,'tt-audio')).toBe(plain);
    expect(bestSource([italian,french,plain,tagged],english,'tt-audio')).toBe(tagged);
    expect(bestSource([italian,french],english,'tt-audio')).toBe(italian);
    expect(bestSource([italian,plain],{...english,audioLanguage:''},'tt-audio')).toBe(italian);
  });
  it('puts the preferred language before an instantly available debrid file in another language',()=>{
    const cachedItalian={url:'https://example.com/a.mkv',title:'Film.2024.iTALiAN.1080p',quality:'1080p',debrid:'cached' as const};
    const plain={infoHash:hash(9),title:'Film.2024.1080p.WEB-DL',quality:'1080p',seeders:20};
    expect(bestSource([cachedItalian,plain],english,'tt-audio')).toBe(plain);
    expect(bestSource([cachedItalian,{...plain,title:'Film.2024.FRENCH.1080p'}],english,'tt-audio')).toBe(cachedItalian);
  });
  it('trusts checked tracks over the release name',()=>{
    const videoId='tt-audio-checked';
    const named={infoHash:hash(1),title:'Film.2024.1080p.WEB',quality:'1080p',seeders:90};
    const dubbed={infoHash:hash(2),title:'Film.2024.1080p.WEB',quality:'1080p',seeders:10};
    saveTrackSummary(named.infoHash,videoId,[{index:0,language:'ita',codec:'aac',default:true}],[]);
    saveTrackSummary(dubbed.infoHash,videoId,[{index:0,language:'ita',codec:'aac',default:true},{index:1,language:'eng',codec:'aac',default:false}],[]);
    expect(bestSource([named,dubbed],english,videoId)).toBe(dubbed);
  });
});
