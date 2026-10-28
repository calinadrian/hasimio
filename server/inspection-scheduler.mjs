// Keep header checks bounded and never add the same hash twice to WebTorrent.
import {INSPECTION_CONCURRENCY} from '../shared/inspection-policy.mjs';
export function createInspectionScheduler(limit=INSPECTION_CONCURRENCY){
  const pending=[],active=new Set();let running=0;
  function pump(){
    while(running<limit){
      const index=pending.findIndex(item=>!active.has(item.key));if(index<0)return;
      const item=pending.splice(index,1)[0];item.signal?.removeEventListener('abort',item.cancel);
      if(item.signal?.aborted){item.reject(new Error('Track check cancelled.'));continue;}
      running++;active.add(item.key);
      Promise.resolve().then(item.task).then(item.resolve,item.reject).finally(()=>{running--;active.delete(item.key);pump();});
    }
  }
  return (key,task,signal)=>new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('Track check cancelled.'));
    const item={key,task,signal,resolve,reject,cancel:undefined};
    item.cancel=()=>{const index=pending.indexOf(item);if(index>=0){pending.splice(index,1);reject(new Error('Track check cancelled.'));pump();}};
    signal?.addEventListener('abort',item.cancel,{once:true});pending.push(item);pump();
  });
}
