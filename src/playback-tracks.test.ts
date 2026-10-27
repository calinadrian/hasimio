import {describe,it,expect,vi,afterEach} from 'vitest';
import {parseVtt,srtToVtt,sourceTrackInfo,trackLabel,saveTrackSummary} from './playback-tracks';

describe('subtitle and source track information',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('shows verified track counts even when browser storage is blocked',()=>{vi.stubGlobal('localStorage',{getItem(){throw new Error('Blocked');},setItem(){throw new Error('Blocked');}});const stream={infoHash:'c'.repeat(40)};saveTrackSummary(stream.infoHash,'blocked-storage',[{index:0,language:'jpn',codec:'aac',default:true}],[{index:0,language:'eng',codec:'subrip',default:false}]);expect(sourceTrackInfo(stream,'blocked-storage')).toMatchObject({verified:true,audio:'1 audio / dub track',subtitles:'1 subtitle track'});expect(sourceTrackInfo(stream,'blocked-storage').detail).toContain('Japanese');expect(sourceTrackInfo(stream,'blocked-storage')).toMatchObject({audioNames:['Japanese'],subtitleNames:['English'],audioCount:1,subtitleCount:1});});
  it('groups duplicate languages while keeping the actual number of tracks',()=>{const hash='b'.repeat(40);saveTrackSummary(hash,'language-summary',[{index:0,language:'eng',codec:'aac',default:true},{index:1,language:'eng',codec:'aac',default:false,title:'Commentary'},{index:2,language:'jpn',codec:'aac',default:false}],[{index:0,language:'und',codec:'subrip',default:false}]);expect(sourceTrackInfo({infoHash:hash},'language-summary')).toMatchObject({audioNames:['English','Japanese'],audioCount:3,subtitleNames:['Unspecified'],subtitleCount:1});});
  it('converts SRT timings and retains multiline subtitle text',()=>{
    const cues=parseVtt(srtToVtt('1\r\n00:00:01,500 --> 00:00:04,000\r\nHello\r\nWorld\r\n\r\n'));
    expect(cues).toEqual([{start:1.5,end:4,text:'Hello\nWorld'}]);
  });
  it('ignores unfinished and invalid WebVTT cues during extraction',()=>{
    expect(parseVtt('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nFirst\n\n00:00:04.000 --> 00:00:05.000\nPart')).toEqual([{start:1,end:3,text:'First'}]);
    expect(parseVtt('WEBVTT\n\ninvalid --> 00:00:02.000\nBad\n\n')).toEqual([]);
  });
  it('labels release hints without presenting them as confirmed tracks',()=>{
    expect(sourceTrackInfo({title:'Movie.DUAL-AUDIO.Multi-Subs.1080p'},'test')).toMatchObject({audio:'Multiple dubs · release tag',subtitles:'Multiple subs · release tag',verified:false});
    expect(sourceTrackInfo({title:'The English Patient.1080p'},'test')).toMatchObject({audio:'Audio check pending',subtitles:'Subtitle check pending'});
  });
  it('identifies subtitle languages and unsupported image tracks',()=>{
    expect(trackLabel({index:0,language:'jpn',codec:'subrip',default:false,supported:true},'Subtitle')).toBe('Japanese · subrip');
    expect(trackLabel({index:1,language:'und',codec:'pgs',default:false,supported:false},'Subtitle')).toContain('Image format (unsupported)');
  });
});

describe('progressively extracted subtitles',()=>{
  it('shows the newest flushed FFmpeg cue before the next cue arrives',()=>{
    expect(parseVtt('WEBVTT\n\n00:01.000 --> 00:03.000\nFirst cue\n')).toEqual([{start:1,end:3,text:'First cue'}]);
  });
  it('accepts whitespace separators and CRLF while preserving multiline text',()=>{
    expect(parseVtt('WEBVTT\r\n\r\n00:01.000 --> 00:03.000\r\nFirst\r\nline\r\n  \r\n00:04.000 --> 00:05.000\r\nSecond\r\n')).toEqual([{start:1,end:3,text:'First\nline'},{start:4,end:5,text:'Second'}]);
  });
  it('ignores comment blocks even when they contain arrows',()=>{
    expect(parseVtt('WEBVTT\n\nNOTE\n00:01.000 --> 00:03.000\nComment\n\n')).toEqual([]);
  });
});
