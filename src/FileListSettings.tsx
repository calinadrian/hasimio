import {useEffect,useState} from 'react';
import {engineUrl} from './engine';
export default function FileListSettings(){
  const [username,setUsername]=useState(''),[passkey,setPasskey]=useState(''),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function request(method='GET'){
    setBusy(true);setMessage('');
    try{
      const response=await fetch(engineUrl('/api/filelist/account'),{method,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify({username,passkey}):undefined,signal:AbortSignal.timeout(20000)});
      const value=await response.json();if(!response.ok)throw Error(value.error||'FileList connection failed.');
      setSaved(value.configured?value.username:'');setPasskey('');
      if(method==='POST'||method==='DELETE')window.dispatchEvent(new CustomEvent('hasimio:filelist-account',{detail:{enabled:method==='POST'}}));
      if(method==='POST')setMessage('FileList connected and enabled. Its sources will appear on matching titles.');
    }catch(error){setMessage(error instanceof Error?error.message:'FileList is unavailable.');}finally{setBusy(false);}
  }
  useEffect(()=>{void request();},[]);
  return <section className="install-panel filelist-settings"><div><h3>FileList account</h3><p>{saved?'Account saved on this device: '+saved:'Connect your FileList account to include private movie and series torrents.'}</p><p>Use your username and API passkey from your FileList profile. Your website password is not needed.</p><form className="install-form" onSubmit={event=>{event.preventDefault();void request('POST');}}><input aria-label="FileList username" autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)} placeholder="FileList username" required maxLength={100}/><input aria-label="FileList API passkey" autoComplete="off" type="password" value={passkey} onChange={event=>setPasskey(event.target.value)} placeholder="API passkey" required maxLength={256}/><button className="button primary" disabled={busy||!username.trim()||!passkey.trim()}>Connect FileList</button></form>{saved&&<button className="button secondary" disabled={busy} onClick={()=>void request('DELETE')}>Disconnect FileList</button>}<p role="status">{message}</p><p>Hasimio discards downloaded data after playback and does not keep seeding. Check that this use complies with your FileList account rules. TV sources must also fit its memory and codec limits.</p><small>The FileList account is shared by profiles on this device. Credentials stay with this device’s service; they are not synced, exported with your library, or included in source results.</small></div></section>;
}
