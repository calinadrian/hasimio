export function playbackTime(seconds:number){
  if(!Number.isFinite(seconds)||seconds<0)return '--:--';
  const value=Math.floor(seconds),hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),remaining=String(value%60).padStart(2,'0');
  return hours?`${hours}:${String(minutes).padStart(2,'0')}:${remaining}`:`${minutes}:${remaining}`;
}
export function seekPosition(target:number,start:number,end:number){
  return Number.isFinite(target)&&Number.isFinite(start)&&Number.isFinite(end)&&end>start?Math.max(start,Math.min(end,target)):undefined;
}

// Prepared movies use growing EVENT playlists but must never chase their live edge.
export const preparedHlsConfig={startPosition:0,lowLatencyMode:false,liveSyncDurationCount:Number.MAX_SAFE_INTEGER,liveMaxLatencyDurationCount:Infinity,maxLiveSyncPlaybackRate:1};
export function timelineDuration(mediaDuration:number,hint?:number,seekableEnd=0){
  if(hint!==undefined&&Number.isFinite(hint)&&hint>0)return hint;
  return Number.isFinite(mediaDuration)&&mediaDuration>0?mediaDuration:Number.isFinite(seekableEnd)?seekableEnd:0;
}
