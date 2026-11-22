import {describe,expect,it} from 'vitest';
import {progressKey,type PlaybackProgress,type ProgressMap} from './playback-progress';
import {activityCalendar,activityFacts,dayKey,progressSummary} from './progress-summary';
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

  describe('overview',()=>{
    const DAY=86_400_000,now=Date.now(),at=(daysAgo:number,hour=20)=>{const date=new Date(now-daysAgo*DAY);date.setHours(hour,0,0,0);return date.getTime();};
    const watched=(videoId:string,updatedAt:number,extra:Partial<PlaybackProgress>={})=>({[progressKey('series',videoId)]:entry({position:3000,duration:3000,completed:true,titleKey:'series:'+videoId.split(':')[0],videoId,updatedAt,...extra})});
    const series=(id:string,name:string,count:number,extra:Partial<Meta>={}):Meta=>({id,type:'series',name,genres:['Drama'],videos:Array.from({length:count},(_,i)=>({id:`${id}:1:${i+1}`,season:1,episode:i+1,title:`Chapter ${i+1}`})),...extra});

    it('counts each finished title on its local day, leaving out bulk marks and unknown dates',()=>{
      const history:ProgressMap={
        ...watched('tt100:1:1',at(2,21)),...watched('tt100:1:2',at(2,23)),
        // Marking the rest watched at once is catching up, not watching.
        ...manual('series:tt100','tt100:1:3',at(1)),...manual('series:tt101','tt101:1:1',at(1)),...manual('series:tt101','tt101:1:2',at(1)),
        // An import without a usable date.
        ...manual('series:tt102','tt102:1:1',1),
        'movie:tt200':entry({position:5400,duration:5400,completed:true,updatedAt:at(0,9)}),
      };
      const summary=progressSummary(history,[{...show,genres:['Drama','Crime']},{...film,genres:['Drama','Comedy']}]);
      expect(Object.fromEntries(summary.activity)).toEqual({
        [dayKey(at(2))]:{count:2,seconds:6000},
        [dayKey(at(1))]:{count:1,seconds:0},
        [dayKey(at(0))]:{count:1,seconds:5400},
      });
      expect(summary.genres).toEqual([{genre:'Drama',seconds:11400},{genre:'Crime',seconds:6000},{genre:'Comedy',seconds:5400}]);
    });

    it('lists the episode to resume, the next one, and new episodes still to air last',()=>{
      const airing=series('tt301','Airing',3);
      airing.videos![2].released=new Date(now+3*DAY).toISOString();
      const history:ProgressMap={
        // Resume: the latest thing watched is an unfinished episode.
        ...watched('tt300:1:1',at(5)),[progressKey('series','tt300:1:2')]:entry({position:1200,duration:3000,titleKey:'series:tt300',videoId:'tt300:1:2',updatedAt:at(1)}),
        ...watched('tt301:1:1',at(3)),...watched('tt301:1:2',at(3,22)),
        // Next after the furthest watched, even with an earlier gap.
        ...watched('tt302:1:3',at(2)),
        ...watched('tt303:1:1',at(4)),...watched('tt303:1:2',at(4)),
      };
      const summary=progressSummary(history,[series('tt300','Resume',4),airing,series('tt302','Gap',5),series('tt303','Done',2)]);
      expect(summary.upNext.map(item=>[item.meta.name,item.label,item.resume,!!item.airs])).toEqual([
        ['Resume','S1 · E2',40,false],['Gap','S1 · E4',undefined,false],['Airing','S1 · E3',undefined,true],
      ]);
      expect(summary.upNext[0]).toMatchObject({watched:1,total:4,percent:25});
    });

    it('leaves long-paused series out of Up next unless a new episode came out since',()=>{
      const fresh=series('tt401','Back again',3);
      fresh.videos![2].released=new Date(now-5*DAY).toISOString();
      const history:ProgressMap={...watched('tt400:1:1',at(200)),...watched('tt401:1:1',at(150)),...watched('tt401:1:2',at(150))};
      const summary=progressSummary(history,[series('tt400','Paused',3),fresh]);
      expect(summary.upNext.map(item=>[item.meta.name,item.fresh])).toEqual([['Back again',true]]);
      expect(summary.series).toHaveLength(2);
    });

    it('leaves announced episodes without a date out of Up next',()=>{
      // Season 1 is out and watched; season 2 is listed but has no air date yet.
      const announced=series('tt601','Announced',2,{videos:[
        {id:'tt601:1:1',season:1,episode:1,released:new Date(now-30*DAY).toISOString()},
        {id:'tt601:1:2',season:1,episode:2,released:new Date(now-20*DAY).toISOString()},
        {id:'tt601:2:1',season:2,episode:1},{id:'tt601:2:2',season:2,episode:2},
      ]});
      // A bare year is not a date either.
      const yearOnly=series('tt602','Next year',2);
      yearOnly.videos![0].released=new Date(now-9*DAY).toISOString();yearOnly.videos![1].released='2099';
      const history:ProgressMap={...watched('tt601:1:1',at(2)),...watched('tt601:1:2',at(1)),...watched('tt602:1:1',at(1)),...watched('tt600:1:1',at(1))};
      const summary=progressSummary(history,[announced,yearOnly,series('tt600','No dates anywhere',3)]);
      expect(summary.upNext.map(item=>[item.meta.name,item.label,!!item.airs])).toEqual([['No dates anywhere','S1 · E2',false]]);
      expect(summary.series).toHaveLength(3);
    });

    it('leaves out series whose history matches none of the listed episodes',()=>{
      // Watched under other episode ids (another catalog), so the first episode would be a guess.
      const summary=progressSummary({...watched('tt500:2:7',at(1)),...watched('tt501:1:1',at(1))},[series('tt500','Other ids',3),series('tt501','Matched',3)]);
      expect(summary.upNext.map(item=>[item.meta.name,item.label])).toEqual([['Matched','S1 · E2']]);
      expect(summary.series).toHaveLength(2);
    });

    it('builds a Monday-first calendar ending today, shading active days by quartile',()=>{
      const today=new Date(2026,10,22,15).getTime(),day=(date:number)=>dayKey(new Date(2026,10,date).getTime());
      const activity=new Map([[day(2),{count:1,seconds:60}],[day(9),{count:2,seconds:60}],[day(16),{count:3,seconds:60}],[day(22),{count:9,seconds:60}]]);
      const calendar=activityCalendar(activity,today,6);
      expect(calendar.columns).toHaveLength(6);
      expect(calendar.columns.every(column=>column.length===7)).toBe(true);
      // 22 November 2026 is a Sunday, so the last column ends today.
      expect(calendar.columns[5][6]).toMatchObject({date:day(22),count:9,level:4});
      expect(calendar.columns[0][0]?.date).toBe(dayKey(new Date(2026,9,12).getTime()));
      expect(calendar.columns.flat().filter(cell=>cell?.count).map(cell=>cell!.level)).toEqual([1,2,3,4]);
      expect(calendar).toMatchObject({activeDays:4,total:15});
      expect(calendar.months.map(month=>month.column)).toEqual([0,3]);
      expect(activityCalendar(new Map([[day(20),{count:2,seconds:60}],[day(21),{count:2,seconds:60}]]),today,1).columns[0].map(cell=>cell?.level)).toEqual([0,0,0,0,3,3,0]);
      // Mid-week, the days still ahead are left empty.
      expect(activityCalendar(activity,new Date(2026,10,18).getTime(),2).columns[1].slice(3)).toEqual([null,null,null,null]);
    });

    it('reports the last seven days and streaks, keeping a run alive until today ends',()=>{
      const today=new Date(2026,10,22,10).getTime(),key=(daysAgo:number)=>dayKey(today-daysAgo*DAY);
      const activity=new Map([[key(1),{count:2,seconds:3600}],[key(2),{count:1,seconds:1800}],[key(3),{count:1,seconds:600}],[key(8),{count:4,seconds:100}],[key(10),{count:1,seconds:1}],[key(11),{count:1,seconds:1}],[key(12),{count:1,seconds:1}],[key(13),{count:1,seconds:1}]]);
      expect(activityFacts(activity,today)).toEqual({weekCount:4,weekSeconds:6000,currentStreak:3,longestStreak:4});
      activity.set(key(0),{count:1,seconds:60});
      expect(activityFacts(activity,today)).toMatchObject({weekCount:5,currentStreak:4});
      expect(activityFacts(new Map(),today)).toEqual({weekCount:0,weekSeconds:0,currentStreak:0,longestStreak:0});
    });
  });
});
