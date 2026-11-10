import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,LoaderCircle,Play,RefreshCw,Search,SlidersHorizontal,Square,Star,Tv} from 'lucide-react';
import {liveChannels,type LiveChannel} from './live-tv';
import {engineUrl} from './engine';
import LiveVideo from './LiveVideo';
import './live-tv.css';
import {liveTvTopRank} from './live-tv-top100';
import {profileStorage,storageKey} from './profile-storage';

const favoritesKey='hasimio:live-tv-favorites:v1';
function readFavorites():string[]{
  try{const value:unknown=JSON.parse(profileStorage.getItem(favoritesKey)??'[]');return Array.isArray(value)?[...new Set(value.filter((id):id is string=>typeof id==='string'))]:[];}catch{return [];}
}

export default function LiveTV(){
  const [iptv,setIptv]=useState<LiveChannel[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
  const [checkedAt,setCheckedAt]=useState('');
  const [source,setSource]=useState('all'),[query,setQuery]=useState(''),[group,setGroup]=useState('');
  const [selected,setSelected]=useState<LiveChannel>(liveChannels[0]);
  const [collection,setCollection]=useState<'all'|'top'|'favorites'>('all');
  const [favorites,setFavorites]=useState(readFavorites),[favoriteError,setFavoriteError]=useState('');
  const [channelPage,setChannelPage]=useState(0);
  useEffect(()=>{
    const changed=(event:StorageEvent)=>{if(event.key===null||event.key===storageKey(favoritesKey))setFavorites(readFavorites());};
    window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
  },[]);
  function toggleFavorite(id:string){
    const current=readFavorites(),next=current.includes(id)?current.filter(value=>value!==id):[...current,id];
    try{profileStorage.setItem(favoritesKey,JSON.stringify(next));setFavorites(next);setFavoriteError('');}
    catch{setFavoriteError('Your favorites could not be saved. Free some device storage and try again.');}
  }
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    void fetch(engineUrl('/api/live-tv/iptv-org/channels'),{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error('IPTV-org channels could not be loaded.');
      const data=await response.json();
      if(!Array.isArray(data.channels)||!data.channels.length)throw Error('IPTV-org returned no channels.');
      if(!controller.signal.aborted){setIptv(data.channels);setCheckedAt(typeof data.checkedAt==='string'?data.checkedAt:'');}
    }).catch(()=>{if(!controller.signal.aborted)setError('IPTV-org channels could not be loaded. Check your connection and try again.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[reload]);
  const channels=useMemo(()=>[...liveChannels,...iptv],[iptv]);
  const groups=useMemo(()=>[...new Set(iptv.map(channel=>channel.group).filter((value):value is string=>Boolean(value)))].sort(),[iptv]);
  const topRank=(channel:LiveChannel)=>channel.provider==='IPTV-org'?liveTvTopRank(channel.name):undefined;
  const topCount=channels.filter(channel=>topRank(channel)!==undefined).length;
  const favoriteCount=channels.filter(channel=>favorites.includes(channel.id)).length;
  const filtered=useMemo(()=>{
    const result=channels.filter(channel=>(collection==='all'||(collection==='top'?channel.provider==='IPTV-org'&&liveTvTopRank(channel.name)!==undefined:favorites.includes(channel.id)))&&(source==='all'||channel.provider===source)&&(!group||channel.group===group)&&(!query.trim()||(channel.name+' '+(channel.group||'')).toLowerCase().includes(query.trim().toLowerCase())));
    return collection==='top'?result.sort((a,b)=>liveTvTopRank(a.name)!-liveTvTopRank(b.name)!):result;
  },[channels,source,group,query,collection,favorites]);
  const pageSize=60,pageCount=Math.max(1,Math.ceil(filtered.length/pageSize)),currentPage=Math.min(channelPage,pageCount-1);
  const visible=filtered.slice(currentPage*pageSize,(currentPage+1)*pageSize);
  useEffect(()=>setChannelPage(0),[collection,source,group,query]);
  function chooseCollection(value:typeof collection){setCollection(value);setSource('all');setGroup('');setQuery('');setChannelPage(0);}
  return <section className="live-tv-page">
    <div className="live-tv-intro"><div><h1>Live TV</h1><p>Find your channel. Settle in.</p></div><span className="live-tv-total"><Tv size={15}/>{channels.length.toLocaleString()} channels</span></div>
    <div className="live-tv-collections" role="group" aria-label="Channel collection">
      <button aria-pressed={collection==='all'} onClick={()=>chooseCollection('all')}>All channels</button>
      <button aria-pressed={collection==='top'} onClick={()=>chooseCollection('top')} title="Curated recommendations">Top 100 <span>{topCount}</span></button>
      <button aria-pressed={collection==='favorites'} onClick={()=>chooseCollection('favorites')}><Star size={15}/>Favorites <span>{favoriteCount}</span></button>
    </div>
    {favoriteError&&<p className="live-tv-catalog-status" role="alert">{favoriteError}</p>}
    <div className="live-tv-layout">
      <aside className="live-tv-browser" aria-label="Browse channels">
        <div className="live-tv-browser-tools">
          <label className="live-tv-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="Search channels" value={query} placeholder="Search channels…" onChange={event=>setQuery(event.target.value)}/></label>
          <details className="live-tv-filter-details"><summary><SlidersHorizontal size={15}/>Filters{(source!=='all'||group)&&<span className="live-tv-filter-dot"/>}</summary>
            <div className="live-tv-filters">
              <label>Source<select value={source} onChange={event=>{setSource(event.target.value);setGroup('');}}><option value="all">All sources</option><option value="Cool-eTv">Cool-eTv</option><option value="IPTV-org">IPTV-org</option></select></label>
              {source!=='Cool-eTv'&&<label>Category<select value={group} onChange={event=>setGroup(event.target.value)}><option value="">All categories</option>{groups.map(value=><option key={value} value={value}>{value}</option>)}</select></label>}
            </div>
          </details>
          <div className="live-tv-list-heading"><span>{collection==='top'?'Recommended':collection==='favorites'?'Your favorites':'Channel guide'}</span><span role="status">{filtered.length.toLocaleString()}</span></div>
        </div>
        {loading&&<p className="live-tv-catalog-status" role="status"><LoaderCircle size={15} className="spin"/>Loading channels…</p>}
        {error&&<div className="live-tv-catalog-status" role="status">{error}<button className="button secondary" onClick={()=>setReload(value=>value+1)}>Retry</button></div>}
        <ul className="live-tv-channel-list" key={currentPage+':'+collection+':'+query+':'+source+':'+group}>
          {visible.map(channel=>{const rank=topRank(channel),active=selected.id===channel.id,isFavorite=favorites.includes(channel.id);return <li key={channel.id} className={active?'is-selected':''}>
            <button className="live-tv-channel-select" aria-pressed={active} onClick={()=>setSelected(channel)}>
              <span className="live-tv-channel-monogram" aria-hidden="true">{collection==='top'&&rank?'#'+rank:channel.name.replace(/[^a-z0-9 ]/gi,'').split(' ').filter(Boolean).slice(0,2).map(word=>word[0]).join('')}</span>
              <span className="live-tv-row-copy"><strong>{channel.name.replace(/ \(\d+p\)/g,'')}</strong><small>{channel.group?.split(';')[0]||channel.provider}{active&&<span className="live-tv-selected-label"> · Selected</span>}</small></span>
            </button>
            <button className="live-tv-row-star" aria-pressed={isFavorite} aria-label={(isFavorite?'Remove '+channel.name+' from':'Add '+channel.name+' to')+' favorites'} title={isFavorite?'Remove from favorites':'Add to favorites'} onClick={()=>toggleFavorite(channel.id)}><Star size={16} fill={isFavorite?'currentColor':'none'}/></button>
          </li>;})}
        </ul>
        {!filtered.length&&!loading&&<div className="live-tv-empty"><Star size={25}/><strong>{collection==='favorites'&&favoriteCount===0?'Your favorites go here':'No channels found'}</strong><p>{collection==='favorites'&&favoriteCount===0?'Tap the star beside any channel to keep it close.':'Try another search or clear your filters.'}</p><button onClick={()=>chooseCollection('all')}>Browse all channels</button></div>}
        <div className="live-tv-list-footer"><span>{filtered.length?`${currentPage*pageSize+1}–${Math.min((currentPage+1)*pageSize,filtered.length)} of ${filtered.length.toLocaleString()}`:'0 channels'}</span><div><button aria-label="Previous channels" disabled={currentPage===0} onClick={()=>setChannelPage(currentPage-1)}><ChevronLeft size={18}/></button><button aria-label="Next channels" disabled={currentPage===pageCount-1} onClick={()=>setChannelPage(currentPage+1)}><ChevronRight size={18}/></button></div></div>
      </aside>
      <ChannelPlayer key={selected.id} channel={selected} favorite={favorites.includes(selected.id)} topRank={topRank(selected)} onFavorite={()=>toggleFavorite(selected.id)}/>
    </div>
    <p className="live-tv-note">English and Romanian channels from <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer">IPTV-org</a>{checkedAt?' · Playback checked '+new Date(checkedAt).toLocaleDateString():''}. Channel availability and regional restrictions can change.</p>
  </section>;
}

function ChannelPlayer({channel,favorite,topRank,onFavorite}:{channel:LiveChannel;favorite:boolean;topRank?:number;onFavorite:()=>void}){
  const [serverIndex,setServerIndex]=useState(()=>Math.max(0,channel.servers.findIndex(server=>server.supported!==false))),[playing,setPlaying]=useState(false);
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
      if(count%2===0&&channel.servers.length>1)setServerIndex(index=>{
        for(let offset=1;offset<channel.servers.length;offset++){const next=(index+offset)%channel.servers.length;if(channel.servers[next].supported!==false)return next;}
        return index;
      });
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
    if(channel.servers[index].supported===false)return;
    cancelRetry();failures.current=0;
    setServerIndex(index);setAttempt(value=>value+1);setPlaying(true);setLoading(true);setSlow(false);setReconnecting(false);
  }
  function changeServer(index:number){
    if(channel.servers[index].supported===false){cancelRetry();setServerIndex(index);setPlaying(false);setLoading(false);setReconnecting(false);setSlow(false);return;}
    if(playing)open(index);else setServerIndex(index);
  }
  const retryMessage=channel.servers.length>1?'Try the other server or reload the channel.':'Reload the channel or try again later.';
  return <section className="live-tv-channel" aria-label={channel.name}>
      <header className="live-tv-heading">
        <div className="live-tv-channel-title"><div className="live-tv-eyebrow"><span className={playing?'live-tv-live-dot is-playing':'live-tv-live-dot'}/>{playing?'Live now':'Ready to watch'}{topRank!==undefined&&<span className="live-tv-top-tag">Top 100 · #{topRank}</span>}</div><h2>{channel.name.replace(/ \(\d+p\)/g,'')}</h2><p>{channel.provider}{/\((\d+p)\)/.exec(channel.name)?.[1]&&<> <span aria-hidden="true">·</span> {/\((\d+p)\)/.exec(channel.name)?.[1]}</>}</p></div>
        <button className="live-tv-favorite" aria-pressed={favorite} title={favorite?'Remove from favorites':'Add to favorites'} onClick={onFavorite} aria-label={(favorite?'Remove '+channel.name+' from':'Add '+channel.name+' to')+' favorites'}><Star size={20} fill={favorite?'currentColor':'none'}/></button>
      </header>
      <div className="live-tv-stage" aria-busy={loading}>
        {playing?<>
          <LiveVideo url={engineUrl('/api/live-tv/'+channel.id+'/'+server.id+'/index.m3u8'+(attempt?'?reconnect='+session.current+'-'+attempt:''))} onLoading={loadingChanged} onError={recover}/>
          {loading&&<div className="live-tv-loading" role="status"><LoaderCircle size={18} className="spin"/>{reconnecting?'Reconnecting': 'Opening'} {server.name.toLowerCase()}…</div>}
        </>:<div className="live-tv-idle">
          <Tv size={44} strokeWidth={1.25} aria-hidden="true"/>
          <h3>{channel.name}</h3>
          <p>{server.supported===false?'This stream uses a format that the Live TV player does not support. Choose another stream if available.':'Watch the live stream directly in Hasimio.'}</p>
          {server.supported!==false&&<button className="button primary" onClick={()=>open()}><Play size={17} fill="currentColor"/>Watch channel</button>}
        </div>}
      </div>
      <div className="live-tv-toolbar">
        <p role="status">{reconnecting?'Connection interrupted. Reconnecting…':slow?'Taking longer than usual? '+retryMessage:playing?'Live broadcast':'Select Watch channel to start.'}</p>
        <div className="live-tv-actions">
          {channel.servers.length>1&&<label className="live-tv-server"><span>Stream</span><select aria-label="Stream" value={serverIndex} onChange={event=>changeServer(Number(event.target.value))}>{channel.servers.map((source,index)=><option key={source.id} value={index}>{source.name}{source.supported===false?' · Unsupported format':''}</option>)}</select></label>}
          {playing&&<><button className="button secondary" onClick={()=>open()} aria-label="Reload Live TV player"><RefreshCw size={16}/>Reload</button><button className="button secondary" onClick={()=>{cancelRetry();failures.current=0;setPlaying(false);setLoading(false);setReconnecting(false);setSlow(false);}}><Square size={14}/>Stop</button></>}
        </div>
      </div>
    </section>;
}
