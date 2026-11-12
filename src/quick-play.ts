// How long a queued episode keeps collecting sources after the first playable one appears.
export const QUICK_PLAY_GRACE_MS=2500;

export type QuickPlayDecision={action:'play'}|{action:'none'}|{action:'wait';retryInMs?:number};

// A queued episode (next, previous, auto-advance) should not wait for every extension:
// one unreachable source would hold each episode change until its timeout. It starts once
// a source that can actually play has been known for a short while, so faster sources
// answering together still compete, and falls back to whatever is left when the search ends.
export function quickPlayDecision({loading,found,usable,waitedMs,graceMs=QUICK_PLAY_GRACE_MS}:{loading:boolean;found:boolean;usable:boolean;waitedMs:number;graceMs?:number}):QuickPlayDecision {
  if(!loading)return found?{action:'play'}:{action:'none'};
  if(!usable)return {action:'wait'};
  return waitedMs>=graceMs?{action:'play'}:{action:'wait',retryInMs:Math.max(0,graceMs-waitedMs)};
}
