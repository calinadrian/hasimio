import {useEffect,useRef,useState} from 'react';
import {LoaderCircle,Play,RefreshCw,Square,Tv} from 'lucide-react';
import {liveChannels} from './live-tv';
import {engineUrl} from './engine';
import LiveVideo from './LiveVideo';
import './live-tv.css';

export default function LiveTV(){
  const [channelIndex,setChannelIndex]=useState(0);
  return <section className="live-tv-page">
    <div className="section-intro"><h1>Live TV</h1><span className="count-label">{liveChannels.length} channels</span></div>
    <label className="live-tv-channel-picker">Channel<select value={channelIndex} onChange={event=>setChannelIndex(Number(event.target.value))}>{liveChannels.map((channel,index)=><option key={channel.id} value={index}>{channel.name}</option>)}</select></label>
    <ChannelPlayer key={liveChannels[channelIndex].id} channel={liveChannels[channelIndex]}/>
  </section>;
}

function ChannelPlayer({channel}:{channel:typeof liveChannels[number]}){
  const [serverIndex,setServerIndex]=useState(0),[playing,setPlaying]=useState(false);
  const [attempt,setAttempt]=useState(0),[loading,setLoading]=useState(false),[slow,setSlow]=useState(false),[reconnecting,setReconnecting]=useState(false);
  const server=channel.servers[serverIndex];
  const failures=useRef(0),retryTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),session=useRef(Date.now().toString(36));
  const cancelRetry=()=>{clearTimeout(retryTimer.current);retryTimer.current=undefined;};
  useEffect(()=>()=>clearTimeout(retryTimer.current),[]);
  useEffect(()=>{if(!playing||loading||reconnecting)return;const timer=setTimeout(()=>{failures.current=0;},20000);return()=>clearTimeout(timer);},[playing,loading,reconnecting,serverIndex,attempt]);
  function recover(){
    if(!playing||retryTimer.current!==undefined)return;
    const count=++failures.current;
    setReconnecting(true);setLoading(true);setSlow(false);
    retryTimer.current=setTimeout(()=>{
      retryTimer.current=undefined;
      // Retry the same server first, then rotate available alternatives.
      if(count%2===0&&channel.servers.length>1)setServerIndex(index=>(index+1)%channel.servers.length);
      setAttempt(value=>value+1);
    },Math.min(30000,1000*2**Math.min(count-1,5)));
  }
  function loadingChanged(value:boolean){setLoading(value);if(!value){setSlow(false);setReconnecting(false);cancelRetry();}}

  useEffect(()=>{
    if(!playing||!loading)return;
    const timer=setTimeout(()=>setSlow(true),15000);
    return()=>clearTimeout(timer);
  },[playing,loading,serverIndex,attempt]);
  function open(index=serverIndex){
    cancelRetry();failures.current=0;
    setServerIndex(index);setAttempt(value=>value+1);setPlaying(true);setLoading(true);setSlow(false);setReconnecting(false);
  }
  function changeServer(index:number){
    if(playing)open(index);else setServerIndex(index);
  }
  const retryMessage=channel.servers.length>1?'Try the other server or reload the channel.':'Reload the channel or try again later.';
  return <section className="live-tv-channel" aria-label={channel.name}>
      <header className="live-tv-heading">
        <span className="live-tv-channel-icon" aria-hidden="true"><Tv size={25}/></span>
        <div className="live-tv-channel-title"><h2>{channel.name}</h2><p>{channel.provider} <span aria-hidden="true">·</span> {channel.servers.length} {channel.servers.length===1?'server':'servers'}</p></div>
        <label className="live-tv-server">Server<select value={serverIndex} onChange={event=>changeServer(Number(event.target.value))}>{channel.servers.map((source,index)=><option key={source.id} value={index}>{source.name}{index===1?' · Alternative':''}</option>)}</select></label>
      </header>
      <div className="live-tv-stage" aria-busy={loading}>
        {playing?<>
          <LiveVideo url={engineUrl('/api/live-tv/'+channel.id+'/'+server.id+'/index.m3u8'+(attempt?'?reconnect='+session.current+'-'+attempt:''))} onLoading={loadingChanged} onError={recover}/>
          {loading&&<div className="live-tv-loading" role="status"><LoaderCircle size={18} className="spin"/>{reconnecting?'Reconnecting': 'Opening'} {server.name.toLowerCase()}…</div>}
        </>:<div className="live-tv-idle">
          <Tv size={44} strokeWidth={1.25} aria-hidden="true"/>
          <h3>{channel.name}</h3>
          <p>Watch the live stream directly in Hasimio.</p>
          <button className="button primary" onClick={()=>open()}><Play size={17} fill="currentColor"/>Watch channel</button>
        </div>}
      </div>
      <div className="live-tv-toolbar">
        <p role="status">{reconnecting?'Connection interrupted. Reconnecting automatically…':slow?'Taking longer than usual? '+retryMessage:playing?'Use the player controls for volume and fullscreen.':'Choose a server, then select Watch channel.'}</p>
        <div className="live-tv-actions">
          {playing&&<><button className="button secondary" onClick={()=>open()} aria-label="Reload Live TV player"><RefreshCw size={16}/>Reload</button><button className="button secondary" onClick={()=>{cancelRetry();failures.current=0;setPlaying(false);setLoading(false);setReconnecting(false);setSlow(false);}}><Square size={14}/>Stop</button></>}
        </div>
      </div>
      <p className="live-tv-note">Video is provided by {channel.provider}. Interrupted playback reconnects automatically. {channel.servers.length>1?'If one server does not play, switch servers above.':'If the stream does not play, reload the channel or try again later.'}</p>
    </section>;
}
