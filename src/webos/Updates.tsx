import {useEffect,useRef,useState} from 'react';
import {bridge,type PalmBridge} from './platform';
type Status={current:string;available?:string;restartReady:boolean;checking:boolean;installing:boolean;error?:string;notice?:string;canRollback:boolean;releaseUrl?:string};
export default function TVUpdates(){
  const [status,setStatus]=useState<Status>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const wake=useRef<PalmBridge|undefined>(undefined);
  async function request(action?:string){
    setBusy(true);setError('');
    try{const response=await fetch('/api/webos/updates',{method:action?'POST':'GET',headers:{'Content-Type':'application/json'},body:action?JSON.stringify({action}):undefined});const value=await response.json();if(!response.ok)throw Error(value.error||'Could not update Hasimio.');setStatus(value);return value as Status;}
    catch(problem){setError(problem instanceof Error?problem.message:'Could not update Hasimio.');}
    finally{setBusy(false);}
  }
  useEffect(()=>{void request();},[]);
  async function restart(){
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/webos/updates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'restart'})});if(!response.ok)throw Error('The TV service could not restart.');
      await new Promise(resolve=>setTimeout(resolve,800));
      wake.current=bridge();if(wake.current){wake.current.onservicecallback=()=>{};wake.current.call('luna://app.hasimio.tv.service/start',JSON.stringify({subscribe:true}));}
      for(let attempt=0;attempt<20;attempt++){
        await new Promise(resolve=>setTimeout(resolve,500));
        try{const health=await fetch('/api/streaming/health',{cache:'no-store',signal:AbortSignal.timeout(1000)});if(health.ok){location.reload();return;}}catch{/* Wait for the service to start. */}
      }
      throw Error('Close Hasimio and open it again to finish the restart.');
    }catch(problem){setError(problem instanceof Error?problem.message:'Close and reopen Hasimio.');setBusy(false);}
  }
  return <section className="tv-storage install-panel"><h3>TV updates</h3><p>Hasimio {status?.current??'TV'} · Updates from calinadrian/hasimio on GitHub.</p><p>{status?.restartReady?'The update is ready. Restart Hasimio to use it.':status?.available?'Version '+status.available+' is available.':status?'Check for a newer TV version.':'Loading update status…'}</p><button className="button secondary" disabled={busy} onClick={()=>void request('check')}>{busy?'Working…':'Check for updates'}</button>{status?.available&&!status.restartReady&&<button className="button primary" disabled={busy} onClick={()=>void request('apply')}>Download update</button>}{status?.restartReady&&<button className="button primary" disabled={busy} onClick={()=>void restart()}>Restart Hasimio</button>}{status?.canRollback&&<button className="button secondary" disabled={busy} onClick={()=>void request('rollback')}>Restore previous version</button>}{status?.releaseUrl&&<a href={status.releaseUrl} target="_blank" rel="noreferrer">Release details</a>}{(error||status?.error)&&<p role="alert">{error||status?.error}</p>}{status?.notice&&<p role="status">{status.notice}</p>}<small>Updates are signature-verified. Playback stops during download. One previous copy is kept; movie caches and watch history are separate.</small></section>;
}
