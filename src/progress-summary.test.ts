import {describe,expect,it} from 'vitest';
import {progressKey,type PlaybackProgress,type ProgressMap} from './playback-progress';
import {progressSummary} from './progress-summary';
import {type Meta} from './media';

const show:Meta={id:'tt100',type:'series',name:'The Show',videos:[
  {id:'tt100:1:1',season:1,episode:1},
  {id:'tt100:1:2',season:1,episode:2},
  {id:'tt100:1:3',season:1,episode:3},
]};
const film:Meta={id:'tt200',type:'movie',name:'The Film'};
const entry=(progress:Partial<PlaybackProgress>):PlaybackProgress=>({position:0,duration:1,updatedAt:1,completed:false,...progress});
const manual=(titleKey:string,videoId:string,updatedAt=1)=>({
  [progressKey('series',videoId)]:entry({position:1,duration:1,completed:true,manual:true,titleKey,videoId,updatedAt}),
});

describe('progress summary',()=>{
  it('counts manual episodes using individual runtimes, then series runtime, and movies once',()=>{
    const history:ProgressMap={
      ...manual('series:tt100','tt100:1:1'),...manual('series:tt100','tt100:1:2'),
      'movie:tt200':entry({position:1,duration:1,completed:true,manual:true}),
    };
    const summary=progressSummary(history,[{...show,runtime:'50 min',videos:show.videos!.map((v,i)=>({...v,runtime:i===0?60:undefined}))},{...film,runtime:'2h 15m'}]);
    expect(summary.watchTime).toBe((60+50+135)*60);
    expect(summary.runtimeMissing).toBe(0);
  });
  it('prefers a known file duration to metadata and counts partial playback only up to its position',()=>{
    const history:ProgressMap={
      'series:tt100:1:1':entry({position:1200,duration:1200,completed:true,manual:true,titleKey:'series:tt100',videoId:'tt100:1:1'}),
      'series:tt100:1:2':entry({position:100,duration:1200,titleKey:'series:tt100',videoId:'tt100:1:2'}),
    };
    expect(progressSummary(history,[{...show,runtime:'50 min'}]).watchTime).toBe(1300);
  });
  it('reports missing lengths and removes runtime when a title is marked unwatched',()=>{
    const history={...manual('series:tt100','tt100:1:1')};
    expect(progressSummary(history,[show])).toMatchObject({watchTime:0,runtimeMissing:1});
    history['series:tt100:1:1']={...history['series:tt100:1:1'],position:0,completed:false};
    expect(progressSummary(history,[{...show,runtime:'50 min'}])).toMatchObject({watchTime:0,runtimeMissing:0});
  });
  it('groups a bulk watched action into one activity entry without changing episode totals',()=>{
    const history={...manual(progressKey('series',show.id),'tt100:1:1',10),...manual(progressKey('series',show.id),'tt100:1:2',10),...manual(progressKey('series',show.id),'tt100:1:3',10)};
    const summary=progressSummary(history,[show]);
    expect(summary.episodesWatched).toBe(3);
    expect(summary.recent).toHaveLength(1);
    expect(summary.recent[0]).toMatchObject({label:'3 episodes marked watched',count:3});
  });
  it('uses full episode metadata even when a catalog preview comes first',()=>{
    const history:ProgressMap={...manual(progressKey('series',show.id),'tt100:1:1')};
    const summary=progressSummary(history,[{...show,videos:undefined},show]);
    expect(summary.series[0]).toMatchObject({total:3,watched:1,percent:33});
    expect(summary.episodesRemaining).toBe(2);
  });

  it('does not imply full completion when episode metadata is unavailable',()=>{
    const summary=progressSummary({...manual(progressKey('series',show.id),'tt100:1:1')},[{...show,videos:undefined}]);
    expect(summary.series[0]).toMatchObject({total:0,watched:1,percent:0,finished:false});
  });
  it('counts manual marks and real playback together',()=>{
    const history:ProgressMap={
      ...manual(progressKey('series',show.id),'tt100:1:1',10),
      [progressKey('series','tt100:1:2')]:entry({position:100,duration:100,completed:true,titleKey:progressKey('series',show.id),videoId:'tt100:1:2',updatedAt:20}),
      [progressKey('series','tt100:1:3')]:entry({position:25,duration:100,titleKey:progressKey('series',show.id),videoId:'tt100:1:3',updatedAt:30}),
      [progressKey('movie',film.id)]:entry({position:500,duration:500,completed:true,updatedAt:40}),
    };
    const summary=progressSummary(history,[show,film]);
    expect(summary).toMatchObject({episodesWatched:2,moviesWatched:1,seriesStarted:1,seriesCompleted:0,episodesRemaining:1});
    // Manually checked episodes have no runtime, so only real playback adds watch time.
    expect(summary.watchTime).toBe(625);
    expect(summary.series[0]).toMatchObject({watched:2,total:3,percent:67,finished:false});
    expect(summary.movies[0]).toMatchObject({watched:1,total:1,percent:100,finished:true});
  });

  it('marks a series finished when every episode is watched',()=>{
    const history:ProgressMap={...manual(progressKey('series',show.id),'tt100:1:1'),...manual(progressKey('series',show.id),'tt100:1:2'),...manual(progressKey('series',show.id),'tt100:1:3')};
    const summary=progressSummary(history,[show]);
    expect(summary).toMatchObject({episodesWatched:3,seriesStarted:1,seriesCompleted:1,episodesRemaining:0});
    expect(summary.series[0]).toMatchObject({watched:3,total:3,percent:100,finished:true});
    expect(summary.watchTime).toBe(0);
  });

  it('keeps totals for titles the app cannot show and lists only known titles',()=>{
    const history:ProgressMap={
      [progressKey('series','tt999:1:1')]:entry({position:1,duration:1,completed:true,manual:true,titleKey:progressKey('series','tt999'),videoId:'tt999:1:1',updatedAt:5}),
      [progressKey('movie','tt900')]:entry({position:90,duration:90,completed:true,updatedAt:6}),
    };
    const summary=progressSummary(history,[show,film]);
    expect(summary).toMatchObject({episodesWatched:1,moviesWatched:1,seriesStarted:1,episodesRemaining:0,watchTime:90});
    expect(summary.series).toEqual([]);
    expect(summary.movies).toEqual([]);
    expect(summary.recent).toEqual([]);
  });

  it('sorts titles and recent activity by the latest update',()=>{
    const other:Meta={...show,id:'tt101',name:'Other Show'};
    const history:ProgressMap={
      ...manual(progressKey('series',show.id),'tt100:1:1',10),
      ...manual(progressKey('series',other.id),'tt101:1:1',20),
      [progressKey('movie',film.id)]:entry({position:80,duration:80,completed:true,updatedAt:30}),
      [progressKey('movie','tt300')]:entry({position:12,duration:80,updatedAt:5}),
    };
    const summary=progressSummary(history,[show,other,film]);
    expect(summary.series.map(item=>item.meta.id)).toEqual(['tt101','tt100']);
    expect(summary.movies.map(item=>item.meta.id)).toEqual(['tt200']);
    expect(summary.recent.map(item=>item.meta.id)).toEqual(['tt200','tt101','tt100']);
    expect(summary.recent[0]).toMatchObject({label:'Movie',completed:true,percent:100});
    expect(summary.recent[1]).toMatchObject({label:'Episode',completed:true});
    expect(summary.recent[2]).toMatchObject({label:'S1 · E1',completed:true});
  });

  it('labels recent episodes from their video when no stored label exists',()=>{
    const history:ProgressMap={
      [progressKey('series','tt100:1:2')]:entry({position:50,duration:100,titleKey:progressKey('series',show.id),videoId:'tt100:1:2',updatedAt:1}),
      [progressKey('series','tt100:1:3')]:entry({position:0,duration:100,titleKey:progressKey('series',show.id),videoId:'tt100:1:3',updatedAt:2}),
    };
    const summary=progressSummary(history,[show]);
    expect(summary.recent).toHaveLength(1);
    expect(summary.recent[0]).toMatchObject({label:'S1 · E2',completed:false,percent:50});
  });
});
