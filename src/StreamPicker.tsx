import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ArrowUpRight,ChevronDown,ExternalLink,HardDrive,ListVideo,LoaderCircle,MonitorPlay,Play,Puzzle,RefreshCw,Users} from 'lucide-react';
import {type Stream,safeHttp} from './media';
import {inspectionWorkers,inspectStreamTracks} from './source-inspection';
import {EnginePanel,useEngine} from './EngineStatus';
import {type Quality} from '../shared/stream-info.mjs';
import {describeStream,availableQualities,defaultQuality,formatSize,sortSources,sourceLanguageMatches} from './stream-options';

import {sourceTrackInfo,subscribeTrackChanges,trackRevision,trackSourceKey} from './playback-tracks';
import {isWebOS} from './webos/platform';
import {usePlayerSettings} from './use-player-settings';
const mobileEngine=import.meta.env.VITE_ANDROID==='true';

const qualityLabel=(q:Quality)=>q==='2K'?'2K · 1440p':q==='4K'?'4K · 2160p':q==='Other'?'Original / unspecified':q;
// episodes: a series whose episode list is still loading, failed to load, or lists nothing yet. Sources are
// searched per episode, so until there is one the panel says why instead of "No sources available yet".
export type EpisodeWait='loading'|'failed'|'none';
export default function StreamPicker({streams,loading,error,automatic,onPlay,onRetry,onManage,videoId,episodes}:{videoId:string;streams:Stream[];loading:boolean;error:string;automatic?:boolean;onPlay:(stream:Stream)=>void;onRetry:()=>void;onManage:()=>void;episodes?:EpisodeWait}) {
  const preferences=usePlayerSettings();
  const [checks,setChecks]=useState<Record<string,string>>({});const [checkAttempt,setCheckAttempt]=useState(0);useSyncExternalStore(subscribeTrackChanges,trackRevision);
  const [chosen,setChosen]=useState<Quality>();const [expanded,setExpanded]=useState(false);const [sort,setSort]=useState('seeders');
  const engine=useEngine();const engineSeen=useRef(engine.state);
  // Sources from the engine failed while it was missing; fetch them again once it appears.
  useEffect(()=>{const before=engineSeen.current;engineSeen.current=engine.state;if(engine.state==='ready'&&(before==='missing'||before==='outdated'))onRetry();},[engine.state,onRetry]);
  const options=streams.map(describeStream),qualities=availableQualities(options);
  const quality=chosen&&qualities.includes(chosen)?chosen:defaultQuality(qualities,preferences.preferredQuality);
  const sources=sortSources(options.filter(o=>o.quality===quality),sort);
  const providers=[...new Set(sources.map(o=>o.provider))];
  // One-click Play covers the usual case, so the full list waits behind a disclosure unless something needs attention.
  const open=expanded||!options.length||!!error;
  const sourceHashes=JSON.stringify(sources.map(o=>trackSourceKey(o.stream,videoId)));
  useEffect(()=>{let live=true;const controller=new AbortController();
    // Checks connect to peers, so they wait until the source list is actually on screen.
    if(!open||automatic)return;
    const pending=[...new Map(sources.filter(o=>o.stream.infoHash).map(o=>[trackSourceKey(o.stream,videoId),o])).values()];
    async function checkSources(){while(live){const option=pending.shift();if(!option)return;const stream=option.stream,hash=trackSourceKey(stream,videoId);if(!live)return;if(!hash||sourceTrackInfo(stream,videoId).verified)continue;
      setChecks(previous=>({...previous,[hash]:'Checking audio and subtitles…'}));
      try{await inspectStreamTracks(stream,videoId,controller.signal);if(live)setChecks(previous=>({...previous,[hash]:''}));}catch(e){if(!live)return;setChecks(previous=>({...previous,[hash]:e instanceof Error?e.message:'Could not inspect this source.'}));}
    }}
    if(engine.state==='ready')void Promise.all(Array.from({length:inspectionWorkers},checkSources));return()=>{live=false;controller.abort();};
  },[sourceHashes,videoId,quality,checkAttempt,engine.state,open,automatic]);
  return <section className="stream-picker" aria-label="Playback sources">
    <div className="stream-picker-heading"><div><h3>Sources</h3>{open&&!loading&&!episodes&&<p>{(isWebOS||mobileEngine)?'Audio and subtitles are checked one source at a time for MKV and WebM files.':'Pick a quality, then a source. Audio and subtitle tracks are checked automatically.'}</p>}</div><button className="icon-button" aria-label={episodes?'Reload the episode list':'Refresh stream sources'} onClick={onRetry} disabled={loading||episodes==='loading'}><RefreshCw size={18} className={loading||episodes==='loading'?'spin':''}/></button></div>
    {engine.state!=='ready'&&<EnginePanel engine={engine}/>}
    {episodes==='loading'?<div className="source-loading" role="status"><LoaderCircle size={22} className="spin"/><div><strong>Loading episodes</strong><p>Sources are searched as soon as the episode list arrives.</p></div></div>
    :episodes==='failed'?<div className="stream-empty"><ListVideo size={28}/><h4>The episode list could not be loaded</h4><p>Sources are searched per episode. Check your connection, then try again.</p><button className="button secondary" onClick={onRetry}><RefreshCw size={16}/> Try again</button></div>
    :episodes==='none'?<div className="stream-empty"><ListVideo size={28}/><h4>No episodes are listed yet</h4><p>Sources can be searched once an episode is listed.</p></div>:<>
    {loading&&options.length>0&&<p className="loading" role="status"><LoaderCircle size={16} className="spin"/> Checking remaining extensions… You can play now.</p>}
    {loading&&!options.length?<div className="source-loading" role="status"><LoaderCircle size={22} className="spin"/><div><strong>Finding available sources</strong><p>Checking your installed extensions…</p></div></div>:options.length&&!open?<button type="button" className="sources-toggle" aria-expanded="false" onClick={()=>setExpanded(true)}><span><strong>{options.length} {options.length===1?'source':'sources'}</strong> in {qualities.length} {qualities.length===1?'quality':'qualities'}</span><span>Choose quality and source <ChevronDown size={16}/></span></button>:options.length?<>
      <div className="source-toolbar"><label>Quality<div className="source-select"><MonitorPlay size={18}/><select aria-label="Stream quality" value={quality} onChange={e=>setChosen(e.target.value as Quality)}>{qualities.map(q=><option key={q} value={q}>{qualityLabel(q)} · {options.filter(o=>o.quality===q).length} {options.filter(o=>o.quality===q).length===1?'source':'sources'}</option>)}</select><ChevronDown size={16}/></div></label><label>Sort by<div className="source-select"><select aria-label="Sort stream sources" value={sort} onChange={e=>setSort(e.target.value)}><option value="seeders">Most seeders</option><option value="size">Smallest file</option></select><ChevronDown size={16}/></div></label></div>
      <div className="source-results-summary"><strong>{qualityLabel(quality)}</strong><span>{sources.length} {sources.length===1?'source':'sources'}{providers.length===1?` from ${providers[0]}`:''}</span></div>
      <div className="quality-source-list">{sources.map((option,index)=>{
        const info=sourceTrackInfo(option.stream,videoId),matches=sourceLanguageMatches(option.stream,videoId,preferences);
        const stream=option.stream,check=checks[trackSourceKey(stream,videoId)],direct=safeHttp(stream.url),external=safeHttp(stream.externalUrl)||(stream.ytId?`https://www.youtube.com/watch?v=${encodeURIComponent(stream.ytId)}`:undefined);
        return <article className="quality-source" key={`${stream.infoHash||stream.url||stream.externalUrl||stream.ytId||option.filename}:${index}`}>
          <div className="source-information"><div className="source-title">{providers.length>1&&<strong>{option.provider}</strong>}{option.release&&<span>{option.release}</span>}{option.codec&&<span className={option.codec==='HEVC'?'codec-note':''}>{option.codec}</span>}</div><div className="source-facts"><span><HardDrive size={14}/>{formatSize(option.sizeBytes)}</span>{option.seeders!=null&&<span className={option.seeders>0?'seeders-available':'seeders-empty'}><Users size={14}/>{option.seeders.toLocaleString()} {option.seeders===1?'seeder':'seeders'}</span>}{!stream.infoHash&&<span>Direct video</span>}</div><div className="source-track-info" title={info.detail}>{info.verified?<><span className="source-language"><strong>Audio:</strong> {info.audioNames.join(', ')||'None'} <small>({info.audioCount} {info.audioCount===1?'track':'tracks'})</small></span><span className="source-language"><strong>Subtitles:</strong> {info.subtitleNames.join(', ')||'None'} <small>({info.subtitleCount} {info.subtitleCount===1?'track':'tracks'})</small></span><small>Checked in file{matches.audio?' · Preferred audio':''}{matches.subtitles?' · Preferred subtitles':''}</small></>:stream.infoHash?<span role="status">{!check||check==='Checking audio and subtitles…'?<><LoaderCircle size={14} className="spin"/>{check||'Queued for track check…'}</>:<>{check} <button type="button" className="track-retry" onClick={()=>setCheckAttempt(n=>n+1)}>Retry track check</button></>}</span>:<span>{matches.subtitles?'Preferred subtitles included':'Track details are available in the video player.'}</span>}</div><details className="release-details"><summary>Release details</summary><p>{option.detail}</p>{info.verified&&<p>{info.detail||'No embedded audio or subtitle tracks.'}</p>}</details></div>
          {direct||stream.infoHash?<button className="button secondary source-play" aria-label={`Play ${option.provider} ${quality} source ${index+1}`} onClick={()=>onPlay(stream)}><Play size={16} fill="currentColor"/> Play</button>:external?<a className="button secondary source-play" href={external} target="_blank" rel="noreferrer">Open <ExternalLink size={14}/></a>:<span className="count-label">Unavailable</span>}
        </article>;
      })}</div><p className="source-note">{sources.some(o=>o.stream.infoHash)?((isWebOS||mobileEngine)?'More seeders can help playback start faster. Video buffers in the TV’s bounded memory cache. ':'More seeders can help playback start faster. Torrent sources buffer locally. Public-source track checks connect to peers and read file headers. '):''}{sources.some(o=>o.codec==='HEVC'||o.codec==='AV1')?'HEVC and AV1 require a compatible browser and device.':''}</p>
    </>:engine.state==='ready'&&(loading||!error)?<div className="stream-empty"><Puzzle size={28}/><h4>No sources available yet</h4><p>Try refreshing, or enable a playback extension.</p><button className="button secondary" onClick={onManage}>Manage extensions <ArrowUpRight size={16}/></button></div>:null}
    {error&&engine.state==='ready'&&<p className="error" role="alert">{error}</p>}</>}
  </section>;
}
