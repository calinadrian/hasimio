import {describe,expect,it} from 'vitest';
import type {Meta} from './media';
import {nextEpisode,orderedEpisodes} from './next-episode';

const show:Meta={
  id:'tt1',type:'series',name:'A Show',videos:[
    {id:'s2e1',season:2,episode:1},
    {id:'s1e2',season:1,episode:2},
    {id:'special',season:0,episode:1},
    {id:'s1e1',season:1,episode:1},
  ],
};

describe('next episode',()=>{
  it('orders numbered seasons first and specials last',()=>{
    expect(orderedEpisodes(show).map(video=>video.id)).toEqual(['s1e1','s1e2','s2e1','special']);
  });
  it('moves through a season, then into the next one',()=>{
    expect(nextEpisode(show,'s1e1')?.id).toBe('s1e2');
    expect(nextEpisode(show,'s1e2')?.id).toBe('s2e1');
    expect(nextEpisode(show,'s2e1')?.id).toBe('special');
  });
  it('stops at the final episode and ignores unknown or missing metadata',()=>{
    expect(nextEpisode(show,'special')).toBeUndefined();
    expect(nextEpisode(show,'missing')).toBeUndefined();
    expect(nextEpisode(undefined,'s1e1')).toBeUndefined();
    expect(nextEpisode(show)).toBeUndefined();
  });
  it('ignores videos that are not episodes',()=>{
    const meta:Meta={...show,videos:[{id:'trailer'},{id:'s1e1',season:1,episode:1}]};
    expect(orderedEpisodes(meta).map(video=>video.id)).toEqual(['s1e1']);
    expect(nextEpisode(meta,'s1e1')).toBeUndefined();
  });
});
