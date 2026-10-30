import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {lastPlayedEpisode,progressKey,resumePosition,savedProgress,saveProgress,titleProgress,playbackHistory,subscribeProgress,continueWatching,setWatched,restoreProgress,episodesBefore,nextEpisodeToWatch} from './playback-progress';

let data:Map<string,string>;
beforeEach(()=>{
  data=new Map();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('persistent playback progress',()=>{
  it('retains every watched episode when marking a series longer than the bookmark limit',()=>{
    const targets=Array.from({length:600},(_,i)=>({key:`series:long:1:${i+1}`,titleKey:'series:long',videoId:`long:1:${i+1}`}));
    setWatched(targets);
    expect(Object.values(playbackHistory()).filter(p=>p.completed)).toHaveLength(600);
  });
  it('notifies cards immediately when playback saves and unsubscribes cleanly',()=>{
    vi.stubGlobal('window',new EventTarget());
    const changed=vi.fn(),unsubscribe=subscribeProgress(changed);
    saveProgress('movie:tt123',50,100);expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();saveProgress('movie:tt123',60,100);expect(changed).toHaveBeenCalledTimes(1);
  });
  it('shows the latest played episode rather than the furthest episode or highest percentage',()=>{
    vi.spyOn(Date,'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    saveProgress('series:tt123:2:3',1700,1800,{titleKey:'series:tt123',videoId:'tt123:2:3'});
    saveProgress('series:tt123:1:1',600,1800,{titleKey:'series:tt123',videoId:'tt123:1:1'});
    const card=titleProgress({type:'series',id:'tt123',name:'Show'},playbackHistory());
    expect(card).toMatchObject({episode:'S1 · E1',percent:33,position:600});
  });
  it('retains anime season mapping on catalog previews and labels finished episodes',()=>{
    saveProgress('series:kitsu:11:14',1400,1400,{completed:true,titleKey:'series:kitsu:11',videoId:'kitsu:11:14',episodeLabel:'S2 · E1'});
    const card=titleProgress({type:'series',id:'kitsu:11',name:'Anime'},playbackHistory());
    expect(card).toMatchObject({episode:'S2 · E1',percent:100,completed:true});
  });
  it('shows no card progress for unwatched titles and handles older anime bookmarks',()=>{
    expect(titleProgress({type:'movie',id:'tt1',name:'Unwatched'},{})).toBeUndefined();
    saveProgress('series:kitsu:11:14',350,1400,{titleKey:'series:kitsu:11',videoId:'kitsu:11:14'});
    expect(titleProgress({type:'series',id:'kitsu:11',name:'Anime'},playbackHistory())).toMatchObject({episode:'Episode 14',percent:25});
  });
  it('restores a movie across fresh reads independently of the chosen source',()=>{
    const key=progressKey('movie','tt123');saveProgress(key,1234.5,7200);
    expect(resumePosition(progressKey('movie','tt123'))).toBe(1234.5);
    expect(savedProgress(key)?.duration).toBe(7200);
    // Rewinding replaces the old bookmark rather than keeping the furthest time.
    saveProgress(key,50,7200);expect(resumePosition(key)).toBe(50);
  });
  it('keeps each series and anime episode separate and recalls the last episode for its title',()=>{
    const time=vi.spyOn(Date,'now');time.mockReturnValue(1000);
    saveProgress(progressKey('series','tt123:1:1'),100,1800,{titleKey:'series:tt123',videoId:'tt123:1:1'});
    time.mockReturnValue(2000);
    saveProgress(progressKey('series','tt123:1:2'),300,1800,{titleKey:'series:tt123',videoId:'tt123:1:2'});
    saveProgress(progressKey('series','kitsu:11:1'),400,1400,{titleKey:'series:kitsu:11',videoId:'kitsu:11:1'});
    expect(resumePosition('series:tt123:1:1')).toBe(100);
    expect(resumePosition('series:tt123:1:2')).toBe(300);
    expect(resumePosition('series:kitsu:11:1')).toBe(400);
    expect(lastPlayedEpisode('series:tt123',['tt123:1:1','tt123:1:2'])).toBe('tt123:1:2');
    expect(lastPlayedEpisode('series:kitsu:11',['kitsu:11:1'])).toBe('kitsu:11:1');
    expect(lastPlayedEpisode('series:tt123',['tt123:1:1'])).toBe('tt123:1:1');
  });
  it('starts finished videos from the beginning without discarding their history',()=>{
    saveProgress('movie:tt123',90,100);expect(resumePosition('movie:tt123')).toBe(90);
    saveProgress('movie:tt123',100,100,{completed:true});expect(resumePosition('movie:tt123')).toBe(0);
    expect(savedProgress('movie:tt123')?.completed).toBe(true);
  });
  it('ignores corrupt storage and invalid timing without breaking playback',()=>{
    data.set('hasimio:playback-progress:v1','broken JSON');expect(resumePosition('movie:tt123')).toBe(0);
    saveProgress('movie:tt123',10,100);expect(resumePosition('movie:tt123')).toBe(10);
    saveProgress('movie:tt123',NaN,100);saveProgress('movie:tt123',20,Infinity);saveProgress('movie:tt123',-1,100);
    expect(resumePosition('movie:tt123')).toBe(10);
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('full');}});
    expect(()=>saveProgress('movie:tt123',10,100)).not.toThrow();expect(resumePosition('movie:tt123')).toBe(0);
  });
  it('marks episodes and movies watched by hand and clears them again',()=>{
    const key='series:tt123:1:1',target={key,titleKey:'series:tt123',videoId:'tt123:1:1',episodeLabel:'S1 · E1'};
    setWatched([target]);
    expect(savedProgress(key)).toMatchObject({completed:true,manual:true});
    expect(savedProgress(key)!.position).toBe(savedProgress(key)!.duration);
    expect(resumePosition(key)).toBe(0);
    expect(titleProgress({type:'series',id:'tt123',name:'Show'},playbackHistory())).toMatchObject({episode:'S1 · E1',percent:100});
    setWatched([target],false);
    expect(savedProgress(key)).toMatchObject({completed:false,position:0});
    expect(titleProgress({type:'series',id:'tt123',name:'Show'},playbackHistory())).toBeUndefined();
    expect(resumePosition(key)).toBe(0);
  });
  it('keeps a known runtime when an episode is marked watched after playing part of it',()=>{
    const key='series:tt123:1:1',target={key,titleKey:'series:tt123',videoId:'tt123:1:1',episodeLabel:'S1 · E1'};
    saveProgress(key,600,1800,{titleKey:'series:tt123',videoId:'tt123:1:1',episodeLabel:'S1 · E1'});
    setWatched([target]);
    expect(savedProgress(key)).toMatchObject({position:1800,duration:1800,completed:true});
    expect(resumePosition(key)).toBe(0);
  });
  it('keeps the episode in progress visible when earlier episodes are marked watched',()=>{
    const time=vi.spyOn(Date,'now');time.mockReturnValue(1000);
    saveProgress('series:tt1:2:1',300,600,{titleKey:'series:tt1',videoId:'tt1:2:1',episodeLabel:'S2 · E1'});
    time.mockReturnValue(2000);
    setWatched([{key:'series:tt1:1:1',titleKey:'series:tt1',videoId:'tt1:1:1',episodeLabel:'S1 · E1'}]);
    expect(titleProgress({type:'series',id:'tt1',name:'Show'},playbackHistory())).toMatchObject({episode:'S2 · E1',percent:50});
    expect(lastPlayedEpisode('series:tt1',['tt1:1:1','tt1:2:1'])).toBe('tt1:2:1');
  });
  it('undoes a watched change by restoring the exact earlier bookmarks',()=>{
    const key='series:tt1:1:1',target={key,titleKey:'series:tt1',videoId:'tt1:1:1',episodeLabel:'S1 · E1'};
    saveProgress(key,120,1800,{titleKey:'series:tt1',videoId:'tt1:1:1',episodeLabel:'S1 · E1'});
    const before={[key]:savedProgress(key)};setWatched([target]);
    restoreProgress(before);expect(savedProgress(key)).toEqual(before[key]);
    const fresh='series:tt1:1:2',freshBefore={[fresh]:savedProgress(fresh)};setWatched([{...target,key:fresh,videoId:'tt1:1:2'}]);
    restoreProgress(freshBefore);expect(savedProgress(fresh)).toBeUndefined();
  });
  it('lists every episode before the chosen one in viewing order, keeping specials apart',()=>{
    const meta={id:'tt1',type:'series',name:'Show',videos:[{id:'s2',season:2,episode:1},{id:'s1e2',season:1,episode:2},{id:'special2',season:0,episode:2},{id:'special1',season:0,episode:1},{id:'s1e1',season:1,episode:1}]};
    expect(episodesBefore(meta,'s2').map(v=>v.id)).toEqual(['s1e1','s1e2']);
    expect(episodesBefore(meta,'special2').map(v=>v.id)).toEqual(['special1']);
    expect(episodesBefore(meta,'missing')).toEqual([]);
    expect(episodesBefore({...meta,videos:[]},'s2')).toEqual([]);
  });
  it('opens the episode after the last checked one when there is no playback yet',()=>{
    const meta={id:'tt1',type:'series',name:'Show',videos:[{id:'e3',season:1,episode:3},{id:'e1',season:1,episode:1},{id:'e2',season:1,episode:2}]};
    expect(nextEpisodeToWatch(meta,{})).toBeUndefined();
    setWatched([{key:'series:e2',titleKey:'series:tt1',videoId:'e2',episodeLabel:'S1 · E2'}]);
    expect(nextEpisodeToWatch(meta,playbackHistory())).toBe('e3');
    setWatched([{key:'series:e3',titleKey:'series:tt1',videoId:'e3',episodeLabel:'S1 · E3'}]);
    expect(nextEpisodeToWatch(meta,playbackHistory())).toBe('e3');
  });
  it('lists unfinished titles newest first, once each, and drops finished ones',()=>{
    const film={id:'tt1',type:'movie',name:'Film'},done={id:'tt2',type:'movie',name:'Done'},show={id:'tt3',type:'series',name:'Show',videos:[{id:'tt3:1:1',episode:1},{id:'tt3:1:2',episode:2}]};
    const history={
      'movie:tt1':{position:30,duration:100,updatedAt:1,completed:false},
      'movie:tt2':{position:100,duration:100,updatedAt:5,completed:true},
      'series:tt3:1:1':{position:100,duration:100,updatedAt:3,completed:true,titleKey:'series:tt3',videoId:'tt3:1:1'},
      'series:tt3:1:2':{position:0,duration:100,updatedAt:2,completed:false,titleKey:'series:tt3',videoId:'tt3:1:2'},
      'movie:tt9':{position:10,duration:100,updatedAt:9,completed:false},
    };
    expect(continueWatching(history,[film,done,show]).map(m=>m.id)).toEqual(['tt3','tt1']);
    history['series:tt3:1:2']={...history['series:tt3:1:2'],position:100,completed:true,updatedAt:4};
    expect(continueWatching(history,[film,done,show]).map(m=>m.id)).toEqual(['tt1']);
  });
  it('removes bulk-watched series regardless of timestamp ties, episode order, or catalog previews',()=>{
    const show={id:'tt10',type:'series',name:'Finished',videos:[{id:'tt10:1:2',season:1,episode:2},{id:'tt10:1:1',season:1,episode:1}]};
    setWatched(show.videos.map(video=>({key:progressKey(show.type,video.id),titleKey:'series:tt10',videoId:video.id})));
    const history=playbackHistory();
    expect(continueWatching(history,[show,{...show,videos:undefined}])).toEqual([]);
    expect(continueWatching(history,[{...show,videos:undefined},show])).toEqual([]);
  });
  it('does not invent a continuation when all known bookmarks are watched but metadata is missing',()=>{
    const show={id:'tt10',type:'series',name:'Finished'};
    setWatched([{key:'series:tt10:1:1',titleKey:'series:tt10',videoId:'tt10:1:1'}]);
    expect(continueWatching(playbackHistory(),[show])).toEqual([]);
    saveProgress('series:tt10:1:2',20,100,{titleKey:'series:tt10',videoId:'tt10:1:2'});
    expect(continueWatching(playbackHistory(),[show])).toEqual([show]);
  });
  it('keeps real unfinished playback even when a newer manual mark is complete',()=>{
    const show={id:'tt10',type:'series',name:'Still watching'};
    vi.spyOn(Date,'now').mockReturnValue(100);
    saveProgress('series:tt10:1:2',20,100,{titleKey:'series:tt10',videoId:'tt10:1:2'});
    vi.mocked(Date.now).mockReturnValue(200);
    setWatched([{key:'series:tt10:1:1',titleKey:'series:tt10',videoId:'tt10:1:1'}]);
    expect(continueWatching(playbackHistory(),[show])).toEqual([show]);
  });
  it('does not keep caught-up series for future episodes or optional specials',()=>{
    const show={id:'tt10',type:'series',name:'Caught up',videos:[{id:'tt10:1:1',season:1,episode:1},{id:'tt10:2:1',season:2,episode:1,released:'2999-01-01'},{id:'tt10:0:1',season:0,episode:1}]};
    setWatched([{key:'series:tt10:1:1',titleKey:'series:tt10',videoId:'tt10:1:1'}]);
    expect(continueWatching(playbackHistory(),[show])).toEqual([]);
    const released={...show,videos:show.videos.map(video=>video.season===2?{...video,released:'2020-01-01'}:video)};
    expect(continueWatching(playbackHistory(),[released])).toEqual([released]);
  });
});
