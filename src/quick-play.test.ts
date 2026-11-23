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
    expect(replacement).toMatchObject({stream:backup,kind:'fallback'});
    expect(recoverPlayback(replacement,[first])).toBe(replacement);
  });
  it('keeps trying further sources, skipping ones that failed, up to the limit',()=>{
    const a={infoHash:'a'.repeat(40),fileIdx:0},b={infoHash:'b'.repeat(40),fileIdx:0},c={infoHash:'c'.repeat(40),fileIdx:0},d={infoHash:'d'.repeat(40),fileIdx:0};
    const ranked=[a,b,c,d].map(stream=>({...stream,name:'x',title:'👤 9'}));
    const second=recoverPlayback({stream:ranked[0],kind:'automatic'},ranked);
    expect(second.stream).toBe(ranked[1]);
    const third=recoverPlayback(second,ranked);
    expect(third.stream).toBe(ranked[2]);
    const fourth=recoverPlayback(third,ranked);
    expect(fourth.stream).toBe(ranked[3]);
    // Every remaining source was tried: the error is shown.
    expect(recoverPlayback(fourth,ranked)).toBe(fourth);
  });
  it('can switch between different files from the same torrent',()=>{
    const alternative={...first,fileIdx:4};
    expect(recoverPlayback(attempt,[first,alternative]).stream).toBe(alternative);
  });
  it('moves on from a hand-picked source that fails before playing',()=>{
    expect(recoverPlayback({kind:'manual',stream:first},[first,backup])).toMatchObject({stream:backup,kind:'fallback'});
  });
  it('keeps playing sources and the normal error when no alternative is available',()=>{
    expect(recoverPlayback(attempt,[first])).toBe(attempt);
    const current={kind:'started' as const,stream:first};
    expect(recoverPlayback(current,[backup])).toBe(current);
  });
});
