// Provider runtimes are minutes, either numeric or labelled (e.g. "50 min", "2h 15m").
export function runtimeSeconds(value:string|number|undefined):number {
  if(typeof value==='number')return Number.isFinite(value)&&value>0?value*60:0;
  if(!value)return 0;
  const text=value.trim().toLowerCase();
  if(/-\s*\d/.test(text))return 0;
  if(/^\d+(?:\.\d+)?$/.test(text))return Number(text)*60;
  let seconds=0;
  for(const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])/g)){
    const unit=match[2][0];seconds+=Number(match[1])*(unit==='d'?86400:unit==='h'?3600:unit==='m'?60:1);
  }
  return Number.isFinite(seconds)?seconds:0;
}
export function formatWatchTime(seconds:number):string {
  const minutes=Math.floor(Math.max(0,seconds)/60);
  if(seconds>0&&minutes<1)return '<1m';
  if(minutes<60)return minutes+'m';
  const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),rest=minutes%60;
  return [days?days+'d':'',hours?hours+'h':'',rest?rest+'m':''].filter(Boolean).join(' ');
}
