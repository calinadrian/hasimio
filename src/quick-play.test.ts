import {describe,expect,it} from 'vitest';
import {quickPlayDecision,QUICK_PLAY_GRACE_MS,recoverPlayback,type PlaybackAttempt} from './quick-play';

describe('queued episode playback',()=>{
  it('waits while nothing playable has arrived',()=>{
    expect(quickPlayDecision({loading:true,found:false,usable:false,waitedMs:0})).toEqual({action:'wait'});
    // An unseeded torrent is a last resort, not a reason to stop looking.
    expect(quickPlayDecision({loading:true,found:true,usable:false,waitedMs:60000})).toEqual({action:'wait'});
  });
  it('gives other sources a short grace period, then plays without waiting for slow ones',()=>{
    expect(quickPlayDecision({loading:true,found:true,usable:true,waitedMs:1000})).toEqual({action:'wait',retryInMs:QUICK_PLAY_GRACE_MS-1000});
    expect(quickPlayDecision({loading:true,found:true,usable:true,waitedMs:QUICK_PLAY_GRACE_MS})).toEqual({action:'play'});
  });
  it('plays the best remaining source, or nothing, once every source has answered',()=>{
    expect(quickPlayDecision({loading:false,found:true,usable:false,waitedMs:0})).toEqual({action:'play'});
    expect(quickPlayDecision({loading:false,found:false,usable:false,waitedMs:0})).toEqual({action:'none'});
  });
});

describe('automatic source recovery',()=>{
  const first={infoHash:'a'.repeat(40),fileIdx:3,seeders:12};
  const backup={url:'https://media.example/backup.mp4',provider:'Backup'};
  const attempt:PlaybackAttempt={stream:first,kind:'automatic'};
  it('takes the next distinct usable file in the supplied language ranking',()=>{
    const alias={...first,infoHash:first.infoHash.toUpperCase(),name:'Different provider'};
    const unavailable={infoHash:'b'.repeat(40),seeders:0};
    const replacement=recoverPlayback(attempt,[alias,first,unavailable,backup,{url:'https://media.example/third.mp4'}]);
    expect(replacement).toEqual({stream:backup,kind:'fallback'});
    expect(recoverPlayback(replacement,[first])).toBe(replacement);
  });
  it('can switch between different files from the same torrent',()=>{
    const alternative={...first,fileIdx:4};
    expect(recoverPlayback(attempt,[first,alternative]).stream).toBe(alternative);
  });
  it('keeps manual choices, playing sources and the normal error when no alternative is available',()=>{
    expect(recoverPlayback(attempt,[first])).toBe(attempt);
    for(const kind of ['manual','started'] as const){
      const current={kind,stream:first};
      expect(recoverPlayback(current,[backup])).toBe(current);
    }
  });
});
