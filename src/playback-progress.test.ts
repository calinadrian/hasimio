import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {lastPlayedEpisode,progressKey,resumePosition,savedProgress,saveProgress,titleProgress,playbackHistory,subscribeProgress,continueWatching} from './playback-progress';

let data:Map<string,string>;
beforeEach(()=>{
  data=new Map();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('persistent playback progress',()=>{
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
});
