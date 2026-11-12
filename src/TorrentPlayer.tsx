import {useEffect,useRef,useState} from 'react';
import {LoaderCircle,Radio,RefreshCw,X,Play,FileVideo} from 'lucide-react';
import {type Stream} from './media';
import Player from './Player';
import {resumePosition} from './playback-progress';
import {engineUrl} from './engine';
import {usePlayerSettings} from './use-player-settings';
import {POLL_FAILURE_LIMIT,torrentPollDelay} from './player-utils';
import {useSubtitleSelection} from './subtitle-selection';
import type {EpisodeAction} from './next-episode';
import {isWebOS} from './webos/platform';
import TVTorrentPlayer from './webos/TorrentPlayer';

import {type MediaTrack,audioAction,defaultAudioTrack,trackLabel,saveTrackSummary,sameLanguage} from './playback-tracks';
type Session={duration?:number;id:string;state:'buffering'|'ready'|'error';error?:string;files:{index:number;name:string;length:number}[];selected?:number;numPeers:number;downloadSpeed:number;downloaded:number;progress:number;mediaUrl?:string;audioTracks?:MediaTrack[];subtitleTracks?:MediaTrack[];subtitle?:{track:number;state:'preparing'|'ready'|'error';error?:string;url:string};audio?:{state:'preparing'|'ready'|'error';track:number;start?:number;offset?:number;error?:string;mediaUrl?:string}};
async function request(url:string,options?:RequestInit):Promise<Session>{const response=await fetch(engineUrl(url),options);if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Hasimio Engine is unavailable. Start it on this PC (npm run engine), or keep Hasimio running with npm run dev or npm run preview.');const result=await response.json();if(!response.ok)throw new Error(result.error || 'The local streaming service did not respond.');return result;}
type Props={stream:Stream;videoId:string;onClose:()=>void;title?:string;progressKey?:string;titleKey?:string;episodeLabel?:string;previous?:EpisodeAction;next?:EpisodeAction};
export default function TorrentPlayer(props:Props){return isWebOS||import.meta.env.VITE_ANDROID==='true'?<TVTorrentPlayer {...props}/>:<DesktopTorrentPlayer {...props}/>;}
function DesktopTorrentPlayer({stream,videoId,onClose,title,progressKey,titleKey,episodeLabel,previous,next}:Props) {
  const [session,setSession]=useState<Session>();const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);const [choosing,setChoosing]=useState(false);const sessionId=useRef<string|undefined>(undefined);
  const [compatible,setCompatible]=useState(true);const [seekStart,setSeekStart]=useState(()=>resumePosition(progressKey));
  const [track,setTrack]=useState(0);const [tracksError,setTracksError]=useState('');const [tracksLoading,setTracksLoading]=useState(false);const [tracksAttempt,setTracksAttempt]=useState(0);
  const [subtitleAttempt,setSubtitleAttempt]=useState(0);const [subtitleError,setSubtitleError]=useState('');
  const [audioError,setAudioError]=useState('');const [audioAttempt,setAudioAttempt]=useState(0);
  const preferences=usePlayerSettings();
  const subtitleSelection=useSubtitleSelection(progressKey??videoId);
  const {choice,choose:chooseSubtitle}=subtitleSelection;
  const subtitleSource=stream.infoHash?.toLowerCase()+':'+session?.selected;
  const supportedSubtitles=session?.subtitleTracks?.filter(item=>item.supported)??[];
  let embeddedSubtitle:MediaTrack|undefined;
  if(choice?.kind==='embedded'){
    if(choice.source===subtitleSource)embeddedSubtitle=supportedSubtitles.find(item=>item.index===choice.index);
    else if(choice.language!=='und'){
      const matches=supportedSubtitles.filter(item=>sameLanguage(item.language,choice.language)&&item.title===choice.title);
      if(matches.length===1)embeddedSubtitle=matches[0];
    }
  }else if(!choice&&preferences.autoSubtitles)embeddedSubtitle=supportedSubtitles.find(item=>sameLanguage(item.language,preferences.subtitleLanguage));
  const embeddedIndex=embeddedSubtitle?.index;
  const audioChosen=useRef(false);
  useEffect(()=>{let live=true;let timer:ReturnType<typeof setTimeout>;let failures=0;const started=Date.now();setError('');setSession(undefined);setCompatible(true);setSeekStart(resumePosition(progressKey));setTrack(0);audioChosen.current=false;
    // A single missed status check must not tear down a video that is playing; only repeated failures do.
    async function poll(id:string){try{const status=await request(`/api/torrents/${id}`);if(!live)return;failures=0;setSession(status);if(status.state==='error'){setError(status.error || 'Torrent playback failed.');return;}const elapsed=Date.now()-started;timer=setTimeout(()=>poll(id),torrentPollDelay(status.state==='buffering'||status.audio?.state==='preparing'||(!status.audio&&elapsed<15000),elapsed));}catch(e){if(!live)return;if(++failures<POLL_FAILURE_LIMIT){timer=setTimeout(()=>poll(id),1500);return;}setError(e instanceof Error?e.message:'Could not check buffering status.');}}
    request('/api/torrents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({infoHash:stream.infoHash,fileIdx:stream.fileIdx,videoId})}).then(result=>{if(!live){void fetch(engineUrl(`/api/torrents/${result.id}`),{method:'DELETE',keepalive:true});return;}sessionId.current=result.id;setSession(result);void poll(result.id);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Could not start torrent playback.');});
    const leave=()=>{if(sessionId.current){void fetch(engineUrl(`/api/torrents/${sessionId.current}`),{method:'DELETE',keepalive:true});sessionId.current=undefined;}};
    window.addEventListener('pagehide',leave);
    return()=>{live=false;clearTimeout(timer);leave();window.removeEventListener('pagehide',leave);};
  },[stream.infoHash,stream.fileIdx,videoId,attempt]);
  useEffect(()=>{let live=true;const controller=new AbortController();setTracksError('');if(!session?.id||session.selected==null||session.state!=='ready')return;setTracksLoading(true);
    request('/api/torrents/'+session.id+'/audio-tracks',{signal:controller.signal}).then(value=>{if(live){if(!audioChosen.current)setTrack(defaultAudioTrack(value.audioTracks));setSession(value);}}).catch(e=>{if(live)setTracksError(e instanceof Error?e.message:'Could not read audio and subtitle tracks.');}).finally(()=>{if(live)setTracksLoading(false);});
    return()=>{live=false;controller.abort();};
  },[session?.id,session?.selected,session?.state,tracksAttempt]);
  useEffect(()=>{let live=true;setAudioError('');
    const plan=audioAction({ready:!!session?.id&&session.selected!=null&&session.state==='ready',compatible,audioTracks:session?.audioTracks,tracksError});
    if(!session||plan.action==='wait')return;
    if(plan.action==='fail'){setAudioError(plan.message);return;}
    if(plan.action==='start'){request(`/api/torrents/${session.id}/audio`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({track,start:seekStart})}).then(value=>{if(live)setSession(value);}).catch(e=>{if(live)setAudioError(e instanceof Error?e.message:'Compatible audio could not start.');});}
    else{request(`/api/torrents/${session.id}/audio`,{method:'DELETE'}).then(value=>{if(live)setSession(value);}).catch(()=>{});}
    return()=>{live=false;};
  },[session?.id,session?.selected,session?.state,session?.audioTracks?.length,tracksError,compatible,track,seekStart,audioAttempt]);
  useEffect(()=>{if(session?.audioTracks&&session.subtitleTracks&&stream.infoHash)saveTrackSummary(stream.infoHash,videoId,session.audioTracks,session.subtitleTracks);},[session?.id,session?.selected,session?.audioTracks?.length,session?.subtitleTracks?.length,stream.infoHash,videoId]);
  useEffect(()=>{let live=true;setSubtitleError('');if(!session?.id||session.selected==null||session.state!=='ready')return;
    request('/api/torrents/'+session.id+'/subtitles/'+(embeddedIndex??0),{method:embeddedIndex===undefined?'DELETE':'POST'}).then(value=>{if(live)setSession(value);}).catch(e=>{if(live)setSubtitleError(e instanceof Error?e.message:'Could not prepare subtitles.');});return()=>{live=false;};
  },[session?.id,session?.selected,session?.state,embeddedIndex,subtitleAttempt]);
  async function retryAudio(){if(!session)return;try{await request(`/api/torrents/${session.id}/audio`,{method:'DELETE'});setSession(previous=>previous?{...previous,audio:undefined}:previous);setAudioAttempt(n=>n+1);}catch(e){setAudioError(e instanceof Error?e.message:'Could not restart audio conversion.');}}
  async function choose(index:number){if(!session)return;setChoosing(true);try{const updated=await request(`/api/torrents/${session.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileIndex:index})});setSeekStart(resumePosition(progressKey));audioChosen.current=false;setTrack(0);setSession(updated);}catch(e){setError(e instanceof Error?e.message:'Could not select that video.');}finally{setChoosing(false);}}
  if(session?.mediaUrl&&!error){
    const audioProblem=compatible?(audioError||(session.audio?.track===track&&(session.audio.start??0)===seekStart?session.audio.error:undefined)):undefined;
    const subtitleTrack=embeddedSubtitle&&session.subtitle?.track===embeddedSubtitle.index&&session.subtitle.state==='ready'?{url:engineUrl(session.subtitle.url),label:trackLabel(embeddedSubtitle,'Subtitle'),language:embeddedSubtitle.language}:undefined;
    const subtitleProblem=subtitleError||(embeddedSubtitle&&session.subtitle?.track===embeddedSubtitle.index?session.subtitle?.error:undefined);
    const audioReady=compatible&&session.audio?.track===track&&(session.audio.start??0)===seekStart;
    // The server reports the keyframe that compatible audio really starts from.
    const url=compatible?(audioReady?session.audio!.mediaUrl:undefined):session.mediaUrl;
    const videoFile=session.files.find(file=>file.index===session.selected);
    const audioPanel=<div className="audio-controls"><label htmlFor="dub-select">Audio / dub</label><select id="dub-select" value={compatible?String(track):'original'} onChange={event=>{audioChosen.current=true;if(event.target.value==='original'){setCompatible(false);setTrack(0);}else{setSeekStart(resumePosition(progressKey));setTrack(Number(event.target.value));setCompatible(true);}}}><option value="original">Original audio (direct)</option>{session.audioTracks?.length?session.audioTracks.map(item=><option key={item.index} value={item.index}>{trackLabel(item)}</option>):<option value="0" disabled={session.audioTracks?.length===0}>{session.audioTracks?.length===0?'No audio tracks':tracksLoading?'Reading audio tracks…':'Audio track 1 · AAC stereo'}</option>}</select><small>{tracksLoading?'Reading audio and subtitle tracks…':session.audioTracks?.length===0?'No embedded audio tracks found.':session.audioTracks?.length===1?'One audio track in this file.':'Changing audio restarts playback.'}</small><small>{compatible?'Compatible AAC audio · click anywhere to seek.':'Original audio · browser codec support required.'}</small>{tracksError&&<div role="status">{tracksError} <button className="button secondary" onClick={()=>setTracksAttempt(n=>n+1)}>Retry languages</button></div>}</div>;
    const subtitleValue=choice?.kind==='off'?'off':choice?.kind==='file'?'file':choice?.kind==='embedded'?(embeddedIndex===undefined?'missing':String(embeddedIndex)):'auto';
    const subtitlePanel=<div className="audio-controls subtitle-controls">
      <label htmlFor="subtitle-select">Subtitles</label>
      <select id="subtitle-select" value={subtitleValue} onChange={event=>{
        const value=event.target.value;
        if(value==='auto')chooseSubtitle();
        else if(value==='off')chooseSubtitle({kind:'off'});
        else{
          const track=session.subtitleTracks?.find(item=>item.supported&&String(item.index)===value);
          if(track)chooseSubtitle({kind:'embedded',source:subtitleSource,index:track.index,language:track.language,title:track.title});
        }
      }}>
        <option value="auto">Automatic</option><option value="off">Off</option>
        {choice?.kind==='file'&&<option value="file" disabled>{choice.file.label}</option>}
        {subtitleValue==='missing'&&<option value="missing" disabled>Saved track unavailable</option>}
        {session.subtitleTracks?.map(item=><option key={item.index} value={item.index} disabled={!item.supported}>{trackLabel(item,'Subtitle')}</option>)}
      </select>
      <small>{tracksLoading?'Reading subtitle tracks…':embeddedSubtitle&&session.subtitle?.state==='preparing'?'Preparing subtitles as video data arrives…':embeddedSubtitle&&subtitleValue==='auto'?'Automatic: '+trackLabel(embeddedSubtitle,'Subtitle'):session.subtitleTracks?.length===0?'No embedded subtitles. Load an SRT / VTT file.':'Choose a track or load your own subtitles.'}</small>
      {subtitleProblem&&<div role="alert"><p>{subtitleProblem}</p><button className="cinema-text-action" onClick={()=>setSubtitleAttempt(value=>value+1)}>Retry subtitles</button></div>}
    </div>;
    const preparation=audioProblem?<><FileVideo size={36}/><h2>Audio conversion unavailable</h2><p role="alert">{audioProblem}</p><button className="cinema-action" onClick={retryAudio}><RefreshCw size={16}/> Retry compatible audio</button></>:!url?<><LoaderCircle size={36} className="spin"/><h2>Preparing your video</h2><p>Buffering compatible sound. The video will start when the first segment is ready.</p></>:undefined;
    return <Player episodeLabel={episodeLabel} progressKey={progressKey} titleKey={titleKey} videoId={videoId} timeOffset={compatible?(audioReady?session.audio!.offset??seekStart:seekStart):0} onSeek={compatible?setSeekStart:undefined} durationHint={session.duration} preparedStream={compatible} title={title} stream={{...stream,url:url?engineUrl(url):undefined,subtitleTrack}} onClose={onClose} onRecoverAudio={!compatible?()=>{setSeekStart(resumePosition(progressKey));setCompatible(true);}:undefined} panels={{audio:audioPanel,subtitles:subtitlePanel}} subtitleSelection={subtitleSelection} embeddedSubtitleLanguages={session.subtitleTracks?session.subtitleTracks.filter(item=>item.supported).map(item=>item.language):tracksError?[]:undefined} download={{url:engineUrl(session.mediaUrl+'?download=1'),filename:videoFile?.name||stream.filename||'video'}} loading={preparation} previous={previous} next={next} status={<><Radio size={14}/><span>{session.numPeers} peers · {(session.downloadSpeed/1024/1024).toFixed(1)} MB/s · {Math.round(session.progress*100)}%</span></>}/>;
  }
  return <div className="torrent-buffering"><div className="player-bar"><strong>{stream.name || 'Torrent stream'}</strong><button className="icon-button" onClick={onClose} aria-label="Stop torrent playback"><X/></button></div><div className="buffering-body">{error?<><FileVideo size={40}/><h2>Couldn’t start this stream</h2><p role="alert">{error}</p><div className="hero-actions"><button className="button primary" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={17}/> Retry</button><button className="button secondary" onClick={onClose}>Choose another source</button></div></>:session?.state==='ready'&&session.selected==null?<><FileVideo size={40}/><h2>Choose the video file</h2><p>This torrent contains several videos. Select the episode you want to play.</p><div className="torrent-files">{session.files.map(file=><button key={file.index} className="button secondary" onClick={()=>choose(file.index)} disabled={choosing}><Play size={16}/>{file.name}</button>)}</div></>:<><LoaderCircle className="spin" size={40}/><h2>Connecting to torrent peers</h2><p>Fetching video information. This can take a moment, especially with fewer seeders.</p><span>{session?.numPeers ?? 0} peers connected</span><button className="button secondary" onClick={onClose}>Cancel and choose another source</button></>}<small>Torrent playback shares data with peers and exposes your IP to them. Temporary downloads are removed when playback stops. MP4/H.264 has the broadest browser support; other codecs may not play.</small></div></div>;
}
