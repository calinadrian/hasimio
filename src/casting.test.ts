import {describe,expect,it} from 'vitest';
import {castContentType,isLoopbackMediaUrl,lanMediaUrl} from './casting';

describe('casting',()=>{
  it('picks a media type from the URL path',()=>{
    expect(castContentType('http://127.0.0.1:11475/api/torrents/id/audio/main.m3u8?token=1')).toBe('application/x-mpegURL');
    expect(castContentType('https://example.com/video.mp4?download=1')).toBe('video/mp4');
    expect(castContentType('https://example.com/watch')).toBe('video/mp4');
  });
  it('recognises loopback media URLs',()=>{
    expect(isLoopbackMediaUrl('http://127.0.0.1:11475/file.mp4')).toBe(true);
    expect(isLoopbackMediaUrl('http://localhost:5176/file.mp4')).toBe(true);
    expect(isLoopbackMediaUrl('https://example.com/file.mp4')).toBe(false);
    expect(isLoopbackMediaUrl('not a URL')).toBe(false);
  });
  it('moves loopback media onto a LAN origin a Chromecast can reach',()=>{
    expect(lanMediaUrl('http://127.0.0.1:11475/api/torrents/id/files/0',['http://192.168.1.5:11475']))
      .toBe('http://192.168.1.5:11475/api/torrents/id/files/0');
    expect(lanMediaUrl('http://192.168.1.5:11475/file.mp4',['http://10.0.0.2:11475']))
      .toBe('http://192.168.1.5:11475/file.mp4');
  });
  it('explains that a loopback stream needs LAN access when no origins are reported',()=>{
    expect(()=>lanMediaUrl('http://127.0.0.1:11475/file.mp4',[])).toThrow(/LAN access/);
  });
});
