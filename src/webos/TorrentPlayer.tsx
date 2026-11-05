import {useEffect,useRef,useState} from 'react';
import type {ComponentProps} from 'react';
import type DesktopTorrentPlayer from '../TorrentPlayer';
import Player from '../Player';
import {engineUrl} from '../engine';

type Session={id:string;state:string;error?:string;files:{index:number;name:string;length:number}[];selected?:number;mediaUrl?:string;numPeers:number;downloadSpeed:number;cacheBytes:number;cacheLimit:number};
export default function TVTorrentPlayer({stream,videoId,onClose,title,progressKey,titleKey,episodeLabel,next}:ComponentProps<typeof DesktopTorrentPlayer>){
  const [session,setSession]=useState<Session>(),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const id=useRef<string|undefined>(undefined);
  async function request(route:string,options?:RequestInit):Promise<Session>{const response=await fetch(engineUrl(route),options);const value=await response.json();if(!response.ok)throw Error(value.error||'The device service could not respond.');return value;}
  useEffect(()=>{
    let live=true,timer:ReturnType<typeof setTimeout>;
    setSession(undefined);setError('');
    async function poll(key:string){try{const value=await request('/api/torrents/'+key);if(!live)return;setSession(value);if(value.error)setError(value.error);else timer=setTimeout(()=>void poll(key),2000);}catch(problem){if(live)setError(problem instanceof Error?problem.message:'Playback stopped.');}}
    void request('/api/torrents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({infoHash:stream.infoHash,fileIdx:stream.fileIdx,videoId})}).then(value=>{if(!live){void fetch(engineUrl('/api/torrents/'+value.id),{method:'DELETE'});return;}id.current=value.id;setSession(value);void poll(value.id);}).catch(problem=>{if(live)setError(problem instanceof Error?problem.message:'Playback could not start.');});
    return()=>{live=false;clearTimeout(timer);if(id.current){void fetch(engineUrl('/api/torrents/'+id.current),{method:'DELETE',keepalive:true});id.current=undefined;}};
  },[stream.infoHash,stream.fileIdx,videoId,attempt]);
  if(session?.mediaUrl&&!error)return <Player stream={{...stream,url:engineUrl(session.mediaUrl)}} title={title} progressKey={progressKey} titleKey={titleKey} videoId={videoId} episodeLabel={episodeLabel} next={next} onClose={onClose} status={<span>{session.numPeers} peers · {(session.downloadSpeed/1048576).toFixed(1)} MB/s · buffer {(session.cacheBytes/1048576).toFixed(0)} / {session.cacheLimit/1048576} MB</span>}/>;
  async function choose(index:number){if(!session)return;try{setSession(await request('/api/torrents/'+session.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileIndex:index})}));}catch(problem){setError(problem instanceof Error?problem.message:'Could not open this video.');}}
  return <section className="torrent-buffering"><div className="player-bar"><strong>{title||stream.name||'Torrent playback'}</strong><button className="button secondary" onClick={onClose}>Back to sources</button></div><div className="buffering-body">{error?<><h2>Couldn’t play this source</h2><p role="alert">{error}</p><button className="button primary" onClick={()=>setAttempt(value=>value+1)}>Retry</button><button className="button secondary" onClick={onClose}>Choose another source</button></>:session?.state==='ready'&&session.selected==null?<><h2>Choose a video</h2><div className="torrent-files">{session.files.map(file=><button className="button secondary" key={file.index} onClick={()=>void choose(file.index)}>{file.name}</button>)}</div></>:<><h2>Connecting to peers…</h2><p>{session?.numPeers??0} peers connected. The device downloads only a small buffer around playback.</p><button className="button secondary" onClick={onClose}>Cancel</button></>}<small>Torrent playback shares data with peers. Video pieces stay in a bounded RAM cache and are discarded when playback stops.</small></div></section>;
}
