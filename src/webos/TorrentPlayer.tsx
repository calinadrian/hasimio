import {useEffect,useRef,useState} from 'react';
import type {ComponentProps} from 'react';
import type DesktopTorrentPlayer from '../TorrentPlayer';
import Player from '../Player';
import {engineUrl} from '../engine';
import {POLL_FAILURE_LIMIT,torrentPollDelay} from '../player-utils';

import {saveTrackSummary,verifiedTracks,type MediaTrack} from '../playback-tracks';

type Session={audioTracks?:MediaTrack[];subtitleTracks?:MediaTrack[];id:string;state:string;error?:string;files:{index:number;name:string;length:number}[];selected?:number;mediaUrl?:string;numPeers:number;downloadSpeed:number;cacheBytes:number;cacheLimit:number};
export default function TVTorrentPlayer({startup,stream,videoId,onClose,title,progressKey,titleKey,episodeLabel,previous,next}:ComponentProps<typeof DesktopTorrentPlayer>){
  const [session,setSession]=useState<Session>(),[error,showError]=useState(''),[attempt,setAttempt]=useState(0);
  // Peers and trackers are flaky while a torrent warms up. Retry the same
  // source quietly twice before reporting a failure (which may switch source).
  const quietRetries=useRef(0);
  useEffect(()=>{quietRetries.current=0;},[stream.infoHash,stream.fileIdx]);
  function setError(message:string){
    // Retrying cannot help a dead or unsuitable torrent; only network hiccups.
    if(message&&quietRetries.current<2&&!/metadata|exceeds|too large|no supported|sharing|too slow/i.test(message)){quietRetries.current++;setTimeout(()=>setAttempt(value=>value+1),2000);return;}
    showError(message);
  }
  const id=useRef<string|undefined>(undefined);
  const chosenFile=useRef(false);
  async function request(route:string,options?:RequestInit):Promise<Session>{const response=await fetch(engineUrl(route),options);const value=await response.json();if(!response.ok)throw Error(value.error||'The device service could not respond.');return value;}
  useEffect(()=>{
    let live=true,timer:ReturnType<typeof setTimeout>,failures=0;const started=Date.now();
    setSession(undefined);setError('');chosenFile.current=false;
    // Check often until the video can start, then relax; one missed check must not stop a playing video.
    async function poll(key:string){try{const value=await request('/api/torrents/'+key);if(!live)return;failures=0;setSession(value);
      // Torrent indexes report stale seeder counts: a source can list hundreds of
      // seeders while its swarm is dead. Give up quickly so Play moves on to the
      // next source instead of showing "0 peers" for minutes.
      const waited=Date.now()-started;
      if(!value.error&&!value.mediaUrl&&!value.files.length){
        if(value.numPeers===0&&waited>25000){showError('No one is sharing this source right now. Try another source.');return;}
        if(waited>60000){showError('This source is too slow to start. Try another source.');return;}
      }
      if(value.error)setError(value.error);else timer=setTimeout(()=>void poll(key),torrentPollDelay(!value.mediaUrl,Date.now()-started,700,2000));}catch(problem){if(!live)return;if(++failures<POLL_FAILURE_LIMIT){timer=setTimeout(()=>void poll(key),2000);return;}setError(problem instanceof Error?problem.message:'Playback stopped.');}}
    void request('/api/torrents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({infoHash:stream.infoHash,fileIdx:stream.fileIdx,videoId})}).then(value=>{if(!live){void fetch(engineUrl('/api/torrents/'+value.id),{method:'DELETE'});return;}id.current=value.id;setSession(value);void poll(value.id);}).catch(problem=>{if(live)setError(problem instanceof Error?problem.message:'Playback could not start.');});
    return()=>{live=false;clearTimeout(timer);if(id.current){void fetch(engineUrl('/api/torrents/'+id.current),{method:'DELETE',keepalive:true});id.current=undefined;}};
  },[stream.infoHash,stream.fileIdx,videoId,attempt]);
  useEffect(()=>{if(error)startup?.failed();},[error,startup]);
  const fileIdx=chosenFile.current?session?.selected:stream.fileIdx;
  useEffect(()=>{
    if(stream.infoHash&&session?.selected!==undefined&&session.audioTracks&&session.subtitleTracks){
      saveTrackSummary(stream.infoHash,videoId,session.audioTracks,session.subtitleTracks,fileIdx,session.selected);
    }
  },[session?.audioTracks,session?.subtitleTracks,session?.selected,stream.infoHash,videoId,fileIdx]);
  const cached=verifiedTracks({...stream,fileIdx},videoId);
  const headerTracks=cached?.fileIndex===session?.selected?cached:undefined;
  // The torrent's own file name lets subtitle search rank versions cut for this release.
  const filename=stream.filename||session?.files.find(file=>file.index===session.selected)?.name;
  if(session?.mediaUrl&&!error)return <Player headerTracks={headerTracks} startup={startup} stream={{...stream,url:engineUrl(session.mediaUrl),filename}} title={title} progressKey={progressKey} titleKey={titleKey} videoId={videoId} episodeLabel={episodeLabel} previous={previous} next={next} onClose={onClose} status={<span>{session.numPeers} peers · {(session.downloadSpeed/1048576).toFixed(1)} MB/s · buffer {(session.cacheBytes/1048576).toFixed(0)} / {session.cacheLimit/1048576} MB</span>}/>;
  async function choose(index:number){if(!session)return;try{const selected=await request('/api/torrents/'+session.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileIndex:index})});chosenFile.current=true;setSession(selected);}catch(problem){setError(problem instanceof Error?problem.message:'Could not open this video.');}}
  return <section className="torrent-buffering"><div className="player-bar"><strong>{title||stream.name||'Torrent playback'}</strong><button className="button secondary" onClick={onClose}>Back to sources</button></div><div className="buffering-body">{error?<><h2>Couldn’t play this source</h2><p role="alert">{error}</p><button className="button primary" onClick={()=>setAttempt(value=>value+1)}>Retry</button><button className="button secondary" onClick={onClose}>Choose another source</button></>:session?.state==='ready'&&session.selected==null?<><h2>Choose a video</h2><div className="torrent-files">{session.files.map(file=><button className="button secondary" key={file.index} onClick={()=>void choose(file.index)}>{file.name}</button>)}</div></>:<><h2>Connecting to peers…</h2><p>{session?.numPeers??0} peers connected. The device downloads only a small buffer around playback.</p><button className="button secondary" onClick={onClose}>Cancel</button></>}<small>Torrent playback shares data with peers. Video pieces stay in a bounded RAM cache and are discarded when playback stops.</small></div></section>;
}
