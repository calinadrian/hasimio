import {useEffect,useRef,useState} from 'react';
import {Upload,LoaderCircle,X} from 'lucide-react';
import {type Meta} from './media';
import {playbackHistory,restoreProgress} from './playback-progress';
import {readTVTimeZip,parseTVTime,matchTVTimeShows,buildTVTimeImport,type TVTimeMatch} from './tvtime-import';

export default function TVTimeImport({onImported}:{onImported:(titles:Meta[],message:string)=>void}){
  const input=useRef<HTMLInputElement>(null),controller=useRef<AbortController|undefined>(undefined);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[matches,setMatches]=useState<TVTimeMatch[]>([]),[skipped,setSkipped]=useState(0),[error,setError]=useState('');
  useEffect(()=>()=>controller.current?.abort(),[]);
  function close(){controller.current?.abort();setBusy(false);setOpen(false);}
  async function read(file?:File){
    if(!file)return;
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setOpen(true);setBusy(true);setError('');setMatches([]);setStatus('Reading watch history…');
    try{
      if(file.size>25*1024*1024)throw new Error('Choose a TV Time ZIP smaller than 25 MB.');
      const parsed=parseTVTime(await readTVTimeZip(await file.arrayBuffer()));setSkipped(parsed.skipped);
      abort.signal.throwIfAborted();setStatus(`Matching 0 of ${parsed.shows.length} shows…`);
      const resolved=await matchTVTimeShows(parsed.shows,abort.signal,done=>setStatus(`Matching ${done} of ${parsed.shows.length} shows…`));
      if(!abort.signal.aborted){setMatches(resolved);setStatus('Review your watch history');}
    }catch(reason){if(!abort.signal.aborted)setError(reason instanceof Error?reason.message:'Could not read this export.');}
    finally{if(!abort.signal.aborted)setBusy(false);}
  }
  const preview=buildTVTimeImport(matches,playbackHistory()),unmatched=matches.filter(item=>!item.meta||!/^tt\d+$/.test(item.meta.id));
  function apply(){
    try{
      const incoming=buildTVTimeImport(matches,playbackHistory());
      restoreProgress(incoming.history);
      const saved=playbackHistory();if(Object.keys(incoming.history).some(key=>!saved[key]?.completed))throw new Error('Watch history could not be saved. Check available device storage and retry.');
      onImported(incoming.titles,`Imported ${Object.keys(incoming.history).length.toLocaleString()} watched episodes from TV Time. ${incoming.preserved.toLocaleString()} existing entries preserved.${unmatched.length?` ${unmatched.length} shows skipped; import again after matching them.`:''}`);
      close();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not save watch history.');}
  }
  return <div className="tvtime-import">
    <button className="button secondary" onClick={()=>input.current?.click()} disabled={busy}><Upload size={16}/> Import TV Time ZIP</button>
    <input ref={input} type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden aria-label="Import TV Time ZIP" onChange={event=>{void read(event.target.files?.[0]);event.currentTarget.value='';}}/>
    {open&&<section className="tvtime-preview" aria-label="TV Time import preview" aria-busy={busy}>
      <div className="progress-section-heading"><h2>Import TV Time progress</h2><button className="icon-button" onClick={close} aria-label="Cancel TV Time import"><X size={18}/></button></div>
      <p>Choose your TV Time personal-data ZIP. Only watched episodes are imported; your existing progress is preserved. The ZIP stays on this device. Show IDs are matched using <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">TVmaze</a>.</p>
      <p role="status">{busy&&<LoaderCircle className="spin" size={16}/>} {status}</p>
      {error&&<p role="alert">{error}</p>}
      {!busy&&matches.length>0&&<>
        <p><strong>{Object.keys(preview.history).length.toLocaleString()} watched {Object.keys(preview.history).length===1?'episode':'episodes'}</strong> ready from {preview.titles.length} {preview.titles.length===1?'show':'shows'}. {preview.preserved.toLocaleString()} existing entries will be kept.{skipped>0&&` ${skipped} incomplete records skipped.`}</p>
        {unmatched.length>0&&<p>{unmatched.length} {unmatched.length===1?'show needs':'shows need'} a match and will be skipped unless you enter their IMDb ID below.</p>}
        <details><summary>Review {matches.length} shows</summary><div className="tvtime-show-list">{matches.map((item,index)=><div className="tvtime-show" key={item.show.tvdb}><span><strong>{item.show.name}</strong><small>{item.show.episodes.length} {item.show.episodes.length===1?'episode':'episodes'} · {item.meta?`Matched: ${item.meta.name}`:item.error}</small></span><label><span className="tvtime-id-label">IMDb ID</span><input aria-label={`IMDb ID for ${item.show.name}`} placeholder="tt1234567" value={item.meta?.id??''} onChange={event=>{const id=event.target.value.trim();setMatches(previous=>previous.map((entry,i)=>i===index?{...entry,meta:id?{id,type:'series',name:entry.show.name,metadataPartial:true}:undefined}:entry));}} aria-invalid={!!item.meta&&!/^tt\d+$/.test(item.meta.id)}/></label></div>)}</div></details>
        <button className="button primary" disabled={!Object.keys(preview.history).length} onClick={apply}>Import watched progress</button>
      </>}
    </section>}
  </div>;
}
