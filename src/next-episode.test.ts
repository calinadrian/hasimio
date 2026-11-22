import {describe,expect,it} from 'vitest';
import type {Meta} from './media';
import {adjacentEpisodes,nextEpisode,orderedEpisodes} from './next-episode';

const show:Meta={
  id:'tt1',type:'series',name:'A Show',videos:[
    {id:'s2e1',season:2,episode:1},
    {id:'s1e2',season:1,episode:2},
    {id:'special',season:0,episode:1},
    {id:'s1e1',season:1,episode:1},
  ],
};

describe('episode navigation',()=>{
  it('orders numbered seasons first and specials last',()=>{
    expect(orderedEpisodes(show).map(video=>video.id)).toEqual(['s1e1','s1e2','s2e1','special']);
  });
  it('moves in both directions across season boundaries',()=>{
    expect(adjacentEpisodes(show,'s1e1').previous).toBeUndefined();
    expect(adjacentEpisodes(show,'s1e1').next?.id).toBe('s1e2');
    expect(nextEpisode(show,'s1e2')?.id).toBe('s2e1');
    expect(adjacentEpisodes(show,'s2e1').previous?.id).toBe('s1e2');
    expect(adjacentEpisodes(show,'s2e1').next?.id).toBe('special');
    expect(adjacentEpisodes(show,'special').previous?.id).toBe('s2e1');
  });
  it('stops at the final episode and ignores unknown or missing metadata',()=>{
    expect(adjacentEpisodes(show,'special').next).toBeUndefined();
    expect(adjacentEpisodes(show,'missing')).toEqual({});
    expect(adjacentEpisodes(undefined,'s1e1')).toEqual({});
    expect(adjacentEpisodes(show)).toEqual({});
  });
  it('offers the next episode only once it is out',()=>{
    const now=Date.UTC(2026,10,23,12),day=86_400_000;
    const airing:Meta={id:'tt2',type:'series',name:'Airing',videos:[
      {id:'e1',season:1,episode:1,released:new Date(now-14*day).toISOString()},
      {id:'e2',season:1,episode:2,released:new Date(now-7*day).toISOString()},
      {id:'e3',season:1,episode:3,released:new Date(now+3*day).toISOString()},
      {id:'s2',season:2,episode:1},
    ]};
    expect(adjacentEpisodes(airing,'e1',now).next?.id).toBe('e2');
    // Airs in three days, and a season announced without dates: nothing to play next.
    expect(adjacentEpisodes(airing,'e2',now)).toEqual({previous:airing.videos![0],next:undefined});
    expect(adjacentEpisodes(airing,'e3',now+4*day).next).toBeUndefined();
    expect(adjacentEpisodes(airing,'e2',now+4*day).next?.id).toBe('e3');
  });
  it('ignores videos that are not episodes',()=>{
    const meta:Meta={...show,videos:[{id:'trailer'},{id:'s1e1',season:1,episode:1}]};
    expect(orderedEpisodes(meta).map(video=>video.id)).toEqual(['s1e1']);
    expect(adjacentEpisodes(meta,'s1e1')).toEqual({previous:undefined,next:undefined});
  });
});
