// OLED care for a paused video (Player.tsx). With nothing pressed, the controls
// give way to a "You're watching" screen, then the picture dims and its text
// drifts, then the screen goes black apart from a small mark that keeps moving.
// Any key, click or pointer movement brings the controls straight back.
export type PauseStage='none'|'screen'|'dim'|'off';

export const PAUSE_STAGE_AFTER={screen:10_000,dim:120_000,off:600_000} as const;
/** How often the text moves while dimmed, and while the screen is off. */
export const DRIFT_EVERY={dim:30_000,off:60_000} as const;

export function pauseStage(idleMs:number):PauseStage{
  if(!(idleMs>=PAUSE_STAGE_AFTER.screen))return 'none';
  if(idleMs<PAUSE_STAGE_AFTER.dim)return 'screen';
  return idleMs<PAUSE_STAGE_AFTER.off?'dim':'off';
}

/** Milliseconds until the next stage begins, or undefined once the screen is off. */
export function nextPauseStageIn(idleMs:number):number|undefined{
  const idle=Math.max(0,idleMs||0);
  const next=[PAUSE_STAGE_AFTER.screen,PAUSE_STAGE_AFTER.dim,PAUSE_STAGE_AFTER.off].find(at=>at>idle);
  return next===undefined?undefined:next-idle;
}

// Spots the drifting text visits, as fractions of the free space, so no pixel
// keeps the same light for long. Positions change in steps, not animations:
// the TV build strips transitions it cannot afford.
const SPOTS:[number,number][]=[[0,0],[.55,.08],[.2,.62],[.7,.5],[.05,.35],[.4,.85],[.85,.15],[.3,.3]];
export function driftSpot(step:number):[number,number]{
  const index=((Math.floor(step)%SPOTS.length)+SPOTS.length)%SPOTS.length;
  return SPOTS[index];
}
