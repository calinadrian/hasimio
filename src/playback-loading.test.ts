import {describe,expect,it} from 'vitest';
import {creep} from './PlaybackLoading';

describe('start screen progress',()=>{
  it('moves towards the stage limit, slowing down, and never passes it',()=>{
    let value=0;const steps:number[]=[];
    for(let tick=0;tick<200;tick++){value=creep(value,45);steps.push(value);}
    expect(steps[0]).toBeGreaterThan(0);
    expect(steps[1]-steps[0]).toBeGreaterThan(steps[20]-steps[19]);
    expect(Math.max(...steps)).toBe(45);
  });
  it('holds where it is when a later stage starts below it',()=>{
    expect(creep(70,45)).toBe(70);
  });
});
