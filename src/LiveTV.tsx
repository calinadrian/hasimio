import {useEffect,useState} from 'react';
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
  const [attempt,setAttempt]=useState(0),[loading,setLoading]=useState(false),[slow,setSlow]=useState(false),[failed,setFailed]=useState(false);
  const server=channel.servers[serverIndex];
  useEffect(()=>{
    if(!playing||!loading)return;
    const timer=setTimeout(()=>{setLoading(false);setSlow(true);},15000);
    return()=>clearTimeout(timer);
  },[playing,loading,serverIndex,attempt]);
  function open(index=serverIndex){
    setServerIndex(index);setAttempt(value=>value+1);setPlaying(true);setLoading(true);setSlow(false);setFailed(false);
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
        {playing&&!failed?<>
          <LiveVideo key={server.id+':'+attempt} url={engineUrl('/api/live-tv/'+channel.id+'/'+server.id+'/index.m3u8')} onLoading={value=>{setLoading(value);if(!value)setSlow(false);}} onError={()=>{setLoading(false);setFailed(true);}}/>
          {loading&&<div className="live-tv-loading" role="status"><LoaderCircle size={18} className="spin"/>Opening {server.name.toLowerCase()}…</div>}
        </>:<div className="live-tv-idle">
          <Tv size={44} strokeWidth={1.25} aria-hidden="true"/>
          <h3>{failed?'The player could not open':channel.name}</h3>
          <p>{failed?retryMessage:'Watch the live stream directly in Hasimio.'}</p>
          <button className="button primary" onClick={()=>open()}><Play size={17} fill="currentColor"/>{failed?'Try again':'Watch channel'}</button>
        </div>}
      </div>
      <div className="live-tv-toolbar">
        <p role="status">{slow?'Taking longer than usual? '+retryMessage:playing?'Use the player controls for volume and fullscreen.':'Choose a server, then select Watch channel.'}</p>
        <div className="live-tv-actions">
          {playing&&<><button className="button secondary" onClick={()=>open()} aria-label="Reload Live TV player"><RefreshCw size={16}/>Reload</button><button className="button secondary" onClick={()=>{setPlaying(false);setLoading(false);setFailed(false);setSlow(false);}}><Square size={14}/>Stop</button></>}
        </div>
      </div>
      <p className="live-tv-note">Video is provided by {channel.provider}. {channel.servers.length>1?'If one server does not play, switch servers above.':'If the stream does not play, reload the channel or try again later.'}</p>
    </section>;
}
