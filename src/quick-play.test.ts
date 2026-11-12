import {describe,expect,it} from 'vitest';
import {quickPlayDecision,QUICK_PLAY_GRACE_MS} from './quick-play';

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
