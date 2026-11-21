import {describe,expect,it} from 'vitest';
import {driftSpot,nextPauseStageIn,pauseStage,PAUSE_STAGE_AFTER} from './pause-stages';

describe('paused player stages',()=>{
  it('moves from controls to the pause screen, dim and screen off',()=>{
    expect(pauseStage(0)).toBe('none');
    expect(pauseStage(PAUSE_STAGE_AFTER.screen-1)).toBe('none');
    expect(pauseStage(PAUSE_STAGE_AFTER.screen)).toBe('screen');
    expect(pauseStage(PAUSE_STAGE_AFTER.dim-1)).toBe('screen');
    expect(pauseStage(PAUSE_STAGE_AFTER.dim)).toBe('dim');
    expect(pauseStage(PAUSE_STAGE_AFTER.off)).toBe('off');
    expect(pauseStage(Number.NaN)).toBe('none');
  });
  it('schedules the next change and stops once the screen is off',()=>{
    expect(nextPauseStageIn(0)).toBe(PAUSE_STAGE_AFTER.screen);
    expect(nextPauseStageIn(PAUSE_STAGE_AFTER.screen)).toBe(PAUSE_STAGE_AFTER.dim-PAUSE_STAGE_AFTER.screen);
    expect(nextPauseStageIn(PAUSE_STAGE_AFTER.dim+500)).toBe(PAUSE_STAGE_AFTER.off-PAUSE_STAGE_AFTER.dim-500);
    expect(nextPauseStageIn(PAUSE_STAGE_AFTER.off)).toBeUndefined();
    expect(nextPauseStageIn(-5)).toBe(PAUSE_STAGE_AFTER.screen);
  });
  it('cycles through drift spots inside the free space',()=>{
    for(let step=-3;step<20;step++){
      const [x,y]=driftSpot(step);
      expect(x).toBeGreaterThanOrEqual(0);expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);expect(y).toBeLessThanOrEqual(1);
    }
    expect(driftSpot(1)).not.toEqual(driftSpot(0));
  });
});
