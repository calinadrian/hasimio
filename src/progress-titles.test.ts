import {it,expect} from 'vitest';
import {progressTitleSeeds} from './progress-titles';
import {progressSummary} from './progress-summary';
it('keeps synced watched titles visible without library or catalog metadata',()=>{
  const history={
    'series:tt100:1:1':{position:1,duration:1,completed:true,manual:true,updatedAt:1,titleKey:'series:tt100',videoId:'tt100:1:1'},
    'series:tt100:1:2':{position:1,duration:1,completed:true,manual:true,updatedAt:1,titleKey:'series:tt100',videoId:'tt100:1:2'},
    'series:kitsu:1376:1':{position:1,duration:1,completed:true,updatedAt:1,titleKey:'series:kitsu:1376'},
    'movie:tt200':{position:1,duration:1,completed:true,updatedAt:1},
  };
  const seeds=progressTitleSeeds(history,[]),summary=progressSummary(history,seeds);
  expect(seeds).toHaveLength(3);
  expect(seeds.find(m=>m.id==='kitsu:1376')?.category).toBe('anime');
  expect(summary.series).toHaveLength(2);expect(summary.movies).toHaveLength(1);
  expect(summary.episodesWatched).toBe(3);
  expect(progressTitleSeeds(history,seeds)).toEqual([]);
});
it('does not resurrect explicit unwatched zero-position entries',()=>{
  expect(progressTitleSeeds({'movie:tt100':{position:0,duration:1,completed:false,updatedAt:2}},[])).toEqual([]);
});
