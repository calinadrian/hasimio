import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,ChevronDown,ExternalLink,FileVideo,HardDrive,LoaderCircle,MonitorPlay,Play,Puzzle,RefreshCw,Users} from 'lucide-react';
import {type Stream,safeHttp} from './media';
import {engineUrl} from './engine';
import {EnginePanel,useEngine} from './EngineStatus';
import {type Quality} from '../shared/stream-info.mjs';
import {INSPECTION_CONCURRENCY} from '../shared/inspection-policy.mjs';
import {describeStream,availableQualities,defaultQuality,formatSize,sortSources} from './stream-options';

import {sourceTrackInfo,saveTrackSummary,type MediaTrack} from './playback-tracks';

const qualityLabel=(q:Quality)=>q==='2K'?'2K · 1440p':q==='4K'?'4K · 2160p':q==='Other'?'Original / unspecified':q;
export default function StreamPicker({streams,loading,error,onPlay,onRetry,onManage,videoId}:{videoId:string;streams:Stream[];loading:boolean;error:string;onPlay:(stream:Stream)=>void;onRetry:()=>void;onManage:()=>void}) {
  const [checks,setChecks]=useState<Record<string,string>>({});const [checkAttempt,setCheckAttempt]=useState(0);const [,setRevision]=useState(0);
  const [chosen,setChosen]=useState<Quality>();const [sort,setSort]=useState('seeders');
  const engine=useEngine();const engineSeen=useRef(engine.state);
  // Sources from the engine failed while it was missing; fetch them again once it appears.
  useEffect(()=>{const before=engineSeen.current;engineSeen.current=engine.state;if(engine.state==='ready'&&(before==='missing'||before==='outdated'))onRetry();},[engine.state,onRetry]);
  const options=streams.map(describeStream),qualities=availableQualities(options);
  const quality=chosen&&qualities.includes(chosen)?chosen:defaultQuality(qualities);
  const sources=sortSources(options.filter(o=>o.quality===quality),sort);
  const sourceHashes=sources.map(o=>o.stream.infoHash||'').join(',');
  useEffect(()=>{let live=true;const controller=new AbortController();
    const pending=[...new Map(sources.filter(o=>o.stream.infoHash).map(o=>[o.stream.infoHash,o])).values()];
    async function checkSources(){while(live){const option=pending.shift();if(!option)return;const stream=option.stream,hash=stream.infoHash;if(!live)return;if(!hash||sourceTrackInfo(stream,videoId).verified)continue;
      setChecks(previous=>({...previous,[hash]:'Checking audio and subtitles…'}));
      try{const response=await fetch(engineUrl('/api/torrent-inspections'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({infoHash:hash,videoId}),signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.error||'Track inspection failed.');if(!Array.isArray(result.audioTracks)||!Array.isArray(result.subtitleTracks))throw new Error('Track information was incomplete.');if(!live)return;saveTrackSummary(hash,videoId,result.audioTracks as MediaTrack[],result.subtitleTracks as MediaTrack[]);setChecks(previous=>({...previous,[hash]:''}));setRevision(n=>n+1);}catch(e){if(!live)return;setChecks(previous=>({...previous,[hash]:e instanceof Error?e.message:'Could not inspect this source.'}));}
    }}
    if(!loading&&engine.state==='ready')void Promise.all(Array.from({length:INSPECTION_CONCURRENCY},checkSources));return()=>{live=false;controller.abort();};
  },[sourceHashes,videoId,quality,loading,checkAttempt,engine.state]);
  return <section className="stream-picker" aria-label="Playback sources">
    <div className="stream-picker-heading"><div><h3>Choose your stream</h3><p>Pick a quality, then choose a source to play. Audio and subtitle tracks are checked automatically before playback.</p></div><button className="icon-button" aria-label="Refresh stream sources" onClick={onRetry} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div>
    {engine.state!=='ready'&&<EnginePanel engine={engine}/>}
    {loading?<div className="source-loading" role="status"><LoaderCircle size={22} className="spin"/><div><strong>Finding available sources</strong><p>Checking your installed extensions…</p></div></div>:options.length?<>
      <div className="source-toolbar"><label>Quality<div className="source-select"><MonitorPlay size={18}/><select aria-label="Stream quality" value={quality} onChange={e=>setChosen(e.target.value as Quality)}>{qualities.map(q=><option key={q} value={q}>{qualityLabel(q)} · {options.filter(o=>o.quality===q).length} {options.filter(o=>o.quality===q).length===1?'source':'sources'}</option>)}</select><ChevronDown size={16}/></div></label><label>Sort by<div className="source-select"><select aria-label="Sort stream sources" value={sort} onChange={e=>setSort(e.target.value)}><option value="seeders">Most seeders</option><option value="size">Smallest file</option></select><ChevronDown size={16}/></div></label></div>
      <div className="source-results-summary"><strong>{qualityLabel(quality)}</strong><span>{sources.length} {sources.length===1?'source':'sources'} available</span></div>
      <div className="quality-source-list">{sources.map((option,index)=>{
        const info=sourceTrackInfo(option.stream,videoId);
        const stream=option.stream,direct=safeHttp(stream.url),external=safeHttp(stream.externalUrl)||(stream.ytId?`https://www.youtube.com/watch?v=${encodeURIComponent(stream.ytId)}`:undefined);
        return <article className="quality-source" key={`${stream.infoHash||stream.url||stream.externalUrl||stream.ytId||option.filename}:${index}`}>
          <div className="source-icon"><FileVideo size={23}/></div><div className="source-information"><div className="source-title"><strong>{option.provider}</strong>{option.release&&<span>{option.release}</span>}{option.codec&&<span className={option.codec==='HEVC'?'codec-note':''}>{option.codec}</span>}</div><div className="source-facts"><span><HardDrive size={14}/>{formatSize(option.sizeBytes)}</span>{option.seeders!=null&&<span className={option.seeders>0?'seeders-available':'seeders-empty'}><Users size={14}/>{option.seeders.toLocaleString()} seeders</span>}{!stream.infoHash&&<span>Direct video</span>}</div><div className="source-track-info" title={info.detail}>{info.verified?<><span className="source-language"><strong>Audio:</strong> {info.audioNames.join(', ')||'None'} <small>({info.audioCount} {info.audioCount===1?'track':'tracks'})</small></span><span className="source-language"><strong>Subtitles:</strong> {info.subtitleNames.join(', ')||'None'} <small>({info.subtitleCount} {info.subtitleCount===1?'track':'tracks'})</small></span><small>Checked in file</small></>:stream.infoHash?<span role="status">{!checks[stream.infoHash]||checks[stream.infoHash]==='Checking audio and subtitles…'?<><LoaderCircle size={14} className="spin"/>{checks[stream.infoHash]||'Queued for track check…'}</>:<>{checks[stream.infoHash]} <button type="button" className="track-retry" onClick={()=>setCheckAttempt(n=>n+1)}>Retry track check</button></>}</span>:<span>Track details are available in the video player.</span>}</div><details className="release-details"><summary>Release details</summary><p>{option.detail}</p>{info.verified&&<p>{info.detail||'No embedded audio or subtitle tracks.'}</p>}</details></div>
          {direct||stream.infoHash?<button className="button primary source-play" aria-label={`Play ${option.provider} ${quality} source ${index+1}`} onClick={()=>onPlay(stream)}><Play size={16} fill="currentColor"/> Play</button>:external?<a className="button secondary source-play" href={external} target="_blank" rel="noreferrer">Open <ExternalLink size={14}/></a>:<span className="count-label">Unavailable</span>}
        </article>;
      })}</div><p className="source-note">{sources.some(o=>o.stream.infoHash)?'More seeders can help playback start faster. Torrent sources buffer locally. Track checks connect to peers and read file headers. ':''}{sources.some(o=>o.codec==='HEVC'||o.codec==='AV1')?'HEVC and AV1 require a compatible browser and device.':''}</p>
    </>:<div className="stream-empty"><Puzzle size={28}/><h4>No sources available yet</h4><p>Try refreshing, or enable a playback extension.</p><button className="button secondary" onClick={onManage}>Manage extensions <ArrowUpRight size={16}/></button></div>}
    {error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
