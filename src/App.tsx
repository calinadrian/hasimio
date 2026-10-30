import {searchStreams} from './stream-search';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {version as appVersion} from '../package.json';

import { Compass, Library, CalendarDays, Puzzle, Search, Play, Plus, Check, ChevronLeft, ChevronRight, X, ArrowUpRight, Film, Info, RefreshCw, ExternalLink, Trash2, LoaderCircle, SlidersHorizontal, Download, Upload, MonitorSmartphone, CircleCheck, BarChart3, Tv } from 'lucide-react';
import { type Meta, type Addon, type Stream, demo, openFilms, getJson, manifestUrl, validateManifest, resourceUrl, supports, demoStreams, safeHttp, nextRelease, episodeLabel } from './media';
import {removeBundledTitle, topResults, defaultAddons, migrateAnimeSource, addDefaultCatalogs, updatePlaybackAddon, type CatalogRow, catalogSelection, loadCatalog, loadMetadata, needsMetadata, titles, replaceCinemeta, sourceMigrations} from './catalogs';
import {defaultEpisode} from './media';
import Calendar from './Calendar';
import PosterImage from './PosterImage';
import {posterSources} from './poster-artwork';
import Progress from './Progress';
import {ActorSearch,ActorTitles,TitleCast,type Person} from './People';
import {cachedProgressTitles,storeProgressTitles,progressTitleSeeds} from './progress-titles';
import LiveTV from './LiveTV';
import {runtimeSeconds} from './watch-time';
import TorrentPlayer from './TorrentPlayer';
import StreamPicker from './StreamPicker';
import { EnginePanel, useEngine } from './EngineStatus';
import { UpdateBanner, UpdatePanel, useUpdates } from './DesktopUpdates';
import { exportLibrary, mergeLibrary, parseLibrary } from './library-transfer';
import './styles.css';
import './shell.css';
import Player from './Player';
import {progressKey,subscribeProgress,progressSnapshot,playbackHistory,titleProgress,continueWatching,savedProgress,setWatched,restoreProgress,episodesBefore,nextEpisodeToWatch,type WatchTarget} from './playback-progress';
import {bestSource} from './stream-options';
import {nextEpisode} from './next-episode';
import Poster from './Poster';
import MediaShelf from './MediaShelf';
import EpisodeList from './EpisodeList';
import SyncDevices from './SyncDevices';
import {deviceSync,useDeviceSync} from './device-sync';
export {Player};

function read<T,>(key: string, fallback: T): T { try { const data = JSON.parse(localStorage.getItem(key) ?? 'null'); return Array.isArray(data) ? data as T : fallback; } catch { return fallback; } }
function useSaved<T,>(key: string, initial: T) { const [value, set] = useState<T>(() => read(key, initial)); useEffect(() => { try { const text=JSON.stringify(value);if(localStorage.getItem(key)!==text){localStorage.setItem(key,text);window.dispatchEvent(new Event('hasimio:local-data'));} } catch { /* UI continues when storage is full or blocked. */ } }, [value,key]); useEffect(()=>{const update=()=>set(previous=>{const next=read(key,initial);return JSON.stringify(next)===JSON.stringify(previous)?previous:next;});window.addEventListener('hasimio:remote-data',update);return()=>window.removeEventListener('hasimio:remote-data',update);},[key]); return [value,set] as const; }
function mediaLabel(meta:Meta) { return meta.category === 'anime' || meta.type === 'anime' ? 'Anime' : meta.type === 'series' ? 'Series' : 'Movie'; }
export default function App() {
  const progressVersion=useSyncExternalStore(subscribeProgress,progressSnapshot);
  const history=useMemo(()=>playbackHistory(progressVersion),[progressVersion]);
  useEffect(()=>{deviceSync.start();},[]);
  const [actor,setActor]=useState<Person>();
  function openActor(person:Person){closeDetail();setActor(person);setCollectionKey(undefined);setBrowseRow(undefined);setPage('Actor');setQuery('');window.scrollTo({top:0,behavior:'instant'});}
  const [collectionKey,setCollectionKey]=useState<string>();
  const collectionScroll=useRef(0);
  const [browseRow,setBrowseRow]=useState<string>();
  const [browsing,setBrowsing]=useState(false);
  const morePending=useRef(new Set<string>());
  const [progressQuery,setProgressQuery]=useState('');
  const [page,setPage] = useState(()=>location.hash.startsWith('#sync-link=')||/^\/connect(?:\.html)?\/?$/.test(location.pathname)?'Sync devices':'Discover'); const [query,setQuery] = useState(''); const [filter,setFilter] = useState('All'); const [genre,setGenre] = useState('All genres');
  const [savedAddons,setAddons] = useSaved<Addon[]>('hasimio:addons', defaultAddons);
  const addons = useMemo(()=>migrateAnimeSource(savedAddons),[savedAddons]); const [library,setLibrary] = useSaved<Meta[]>('hasimio:library', []);
  useEffect(() => {setAddons(previous => updatePlaybackAddon(migrateAnimeSource(previous)));},[setAddons]);
  const [catalogs,setCatalogs] = useState<CatalogRow[]>([]); const [loading,setLoading] = useState(false); const [catalogError,setCatalogError] = useState(''); const [refresh,setRefresh] = useState(0);
  const [calendarLoading,setCalendarLoading] = useState(false); const [calendarRefresh,setCalendarRefresh] = useState(0); const [clockTick,setClockTick] = useState(0);
  const progressRefreshApplied=useRef(0);
  const [progressMetadata,setProgressMetadata]=useState<Meta[]>(cachedProgressTitles);const [progressLoading,setProgressLoading]=useState(false);const [progressRefresh,setProgressRefresh]=useState(0);
  const [selected,setSelected] = useState<Meta>(); const [detailLoading,setDetailLoading] = useState(false); const [streams,setStreams] = useState<Stream[]>([]); const [streamLoading,setStreamLoading] = useState(false); const [streamError,setStreamError] = useState(''); const [episode,setEpisode] = useState<string>(); const [autoNext,setAutoNext] = useState<string>();
  const [playing,setPlaying] = useState<Stream>(); const [installUrl,setInstallUrl] = useState(''); const [installing,setInstalling] = useState(false); const [installError,setInstallError] = useState(''); const [notice,setNotice] = useState<{text:string;undo?:()=>void}>(); const [noticeHeld,setNoticeHeld] = useState(false); const [dialogScrolled,setDialogScrolled] = useState(false);
  const notify = (text:string,undo?:()=>void) => setNotice({text,undo});
  const sync = useDeviceSync(); const syncLabel = sync.state === 'off' ? 'Saved on this device' : sync.state === 'syncing' ? 'Syncing…' : sync.state === 'offline' ? 'Sync offline' : sync.state === 'revoked' ? 'Sync disconnected' : `Synced · ${sync.devices.length} device${sync.devices.length === 1 ? '' : 's'}`;
  const engine = useEngine(); const update = useUpdates(); const importInput = useRef<HTMLInputElement>(null);
  const detailAbort=useRef<AbortController>(undefined); const detailCache=useRef(new Map<string,Meta>());
  const detailRequest = useRef(0); const streamRequest = useRef(0); const catalogRequest = useRef(0); const dialog = useRef<HTMLDialogElement>(null);
  // Earlier versions saved a bundled Insula Iubirii entry into every library; take it back out once.
  useEffect(() => {try {if(localStorage.getItem('hasimio:manual-insula-iubirii-v1') === 'done'){setLibrary(removeBundledTitle);localStorage.setItem('hasimio:manual-insula-iubirii-v1','removed');}}catch{/* Storage is blocked; nothing was added either. */}},[setLibrary]);
  useEffect(() => {for (const [flag,apply] of sourceMigrations) {try {if(localStorage.getItem(flag) !== 'done'){setAddons(apply);localStorage.setItem(flag,'done');}}catch{/* New sessions still receive the default sources. */}}},[setAddons]);
  useEffect(() => {window.scrollTo(0,0);},[page]);
  const libraryKeys = library.map(m => `${m.type}:${m.id}`).sort().join('|');
  useEffect(() => { try { if (localStorage.getItem('hasimio:default-catalogs-v1') !== 'done') { setAddons(previous => addDefaultCatalogs(previous)); localStorage.setItem('hasimio:default-catalogs-v1','done'); } } catch { /* Defaults are still supplied on a new session when storage is blocked. */ } },[setAddons]);
  useEffect(() => { const update = () => { if (document.visibilityState === 'visible') setClockTick(n => n+1); }; const interval = setInterval(update,15*60*1000); document.addEventListener('visibilitychange',update); return () => {clearInterval(interval);document.removeEventListener('visibilitychange',update);}; },[]);
  useEffect(() => {
    const controller = new AbortController(); let live = true;
    const queue = library.filter(meta => calendarRefresh > (meta.metadataFetchedAt ?? 0) || needsMetadata(meta) || (meta.metadataError && addons.some(a => supports(a,'meta',meta.type,meta.id))));
    setCalendarLoading(queue.length > 0);
    // Bound concurrency so restoring a large library does not flood metadata providers.
    async function worker() { while (queue.length && live) { const meta = queue.shift()!; try { const updated = await loadMetadata(meta,addons,controller.signal); if (live) setLibrary(previous => previous.map(m => m.id === meta.id && m.type === meta.type ? updated : m)); } catch { if (controller.signal.aborted) return; } } }
    Promise.all(Array.from({length:Math.min(3,queue.length)},worker)).then(() => {if (live) setCalendarLoading(false);});
    return () => {live=false;controller.abort();};
    // Metadata writes do not restart synchronization; changes to membership do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[libraryKeys,addons,calendarRefresh,clockTick]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement) && !dialog.current?.open) { event.preventDefault(); document.querySelector<HTMLInputElement>('.search input')?.focus(); } }; document.addEventListener('keydown',onKey); return () => document.removeEventListener('keydown',onKey); },[]);
  useEffect(() => { if (!notice || noticeHeld) return; const timer = setTimeout(() => setNotice(undefined),4500); return () => clearTimeout(timer); },[notice,noticeHeld]);
  useEffect(() => {
    const controller = new AbortController(); let live = true; catalogRequest.current++; setLoading(true); setCatalogError('');
    setCatalogs([]);
    const selection = catalogSelection(addons,query.trim(),filter);
    const order = (row:CatalogRow) => selection.findIndex(s => s.addon.url === row.addon.url && s.catalog.id === row.catalog.id && s.catalog.type === row.catalog.type);
    const timer = setTimeout(async () => { const results = await Promise.allSettled(selection.map(async ({addon,catalog}) => {
      const row = await loadCatalog(addon,catalog,query.trim(),0,controller.signal);
      if (live) setCatalogs(previous => [...previous,row].sort((a,b) => order(a)-order(b)));
    })); if (!live) return; const reasons = results.flatMap(r => r.status === 'rejected' && r.reason instanceof Error ? [r.reason.message] : []); const failures = results.filter(r => r.status === 'rejected').length;
      // Hasimio Titles explains a first-time index build; say so and check again shortly instead of asking for a manual refresh.
      const building = reasons.find(reason => reason.startsWith('Building Hasimio’s title index'));
      if (building) { setCatalogError(building); retry = setTimeout(() => setRefresh(n => n+1),15000); }
      // One unreachable source is not worth a warning while others still show titles.
      else if (failures && failures === results.length) setCatalogError(`Catalogs could not load. ${[...new Set(reasons)].slice(0,2).join(' ')} Try refreshing.`.replace(/\s+/g,' '));
      setLoading(false); },250);
    let retry: ReturnType<typeof setTimeout> | undefined;
    return () => { live = false; controller.abort(); clearTimeout(timer); clearTimeout(retry); };
  },[addons,query,filter,refresh]);
  useEffect(() => {
    if (selected) dialog.current?.showModal(); else dialog.current?.close();
  },[selected?.id]);
  useEffect(() => { if (!selected) return; const request = ++streamRequest.current; setStreams([]); setStreamError(''); setStreamLoading(true); const id = episode || selected.id;
    if (selected.type !== 'movie' && !episode) {setStreamLoading(false);return;}
    if (selected.id.startsWith('open:')) { setStreams(addons.some(a => a.builtin && a.enabled) ? demoStreams(selected.id) : []); setStreamLoading(false); return; }
    const sources = addons.filter(a => !a.builtin && supports(a,'stream',selected.type,id));
    const controller=new AbortController();
    void searchStreams(sources,selected.type,id,controller.signal,state=>{
      if(request!==streamRequest.current)return;
      setStreams(state.streams);setStreamLoading(state.pending>0);
      setStreamError(state.pending===0&&state.failed.length?`Couldn’t reach ${state.failed.join(', ')}. Retry to check again.`:'');
    });
    return()=>controller.abort();
  },[selected?.id,selected?.type,episode,addons,refresh]);
  // Auto-play waits for the next episode's stream search, then opens the best available source once.
  useEffect(() => {
    if (!autoNext) return;
    if (playing) { setAutoNext(undefined); return; }
    if (streamLoading) return;
    const best = bestSource(streams);
    setAutoNext(undefined);
    if (best) setPlaying(best);
    else notify('No playable source was found for the next episode. Choose another source.');
  },[autoNext,playing,streamLoading,streams]);

  async function open(meta: Meta,videoId?:string) {
    const request=++detailRequest.current;
    detailAbort.current?.abort();
    const controller=new AbortController();detailAbort.current=controller;
    const cacheKey=JSON.stringify([meta.type,meta.id,addons.filter(a=>a.enabled).map(a=>[a.url,a.manifest.version])]);
    const savedMeta=library.find(m=>m.id===meta.id&&m.type===meta.type);
    const cached=detailCache.current.get(cacheKey);
    const initial=cached??(savedMeta&&(!needsMetadata(savedMeta)||(savedMeta.videos?.length??0)>(meta.videos?.length??0))?savedMeta:meta);
    const initialEpisode=(videoId&&initial.videos?.some(v=>v.id===videoId)?videoId:undefined)??nextEpisodeToWatch(initial,history)??defaultEpisode(initial)?.id;
    setSelected(initial);setEpisode(initialEpisode);setAutoNext(undefined);setPlaying(undefined);setDialogScrolled(false);
    if(dialog.current)dialog.current.scrollTop=0;
    const refreshNeeded=needsMetadata(initial)||initial.type!=='movie'&&!initial.videos?.length;
    setDetailLoading(refreshNeeded);
    if(!refreshNeeded)return;
    try{
      const updated=await loadMetadata(initial,addons,controller.signal);
      if(request!==detailRequest.current)return;
      if(!updated.metadataError){
        detailCache.current.delete(cacheKey);detailCache.current.set(cacheKey,updated);
        if(detailCache.current.size>50)detailCache.current.delete(detailCache.current.keys().next().value!);
      }
      setSelected(updated);
      setEpisode(current=>current&&updated.videos?.some(v=>v.id===current)?current:nextEpisodeToWatch(updated,history)??defaultEpisode(updated)?.id);
      setLibrary(previous=>previous.map(m=>m.id===meta.id&&m.type===meta.type?updated:m));
    }catch(error){if(!controller.signal.aborted)notify(error instanceof Error?error.message:'Could not load details. Try again.');}
    finally{if(request===detailRequest.current)setDetailLoading(false);}
  }
  function closeDetail() { detailAbort.current?.abort();detailRequest.current++; streamRequest.current++; setSelected(undefined); setPlaying(undefined); setAutoNext(undefined); }
  function chooseEpisode(id:string) {setAutoNext(undefined);setEpisode(id);}
  function watchTarget(videoId?:string):WatchTarget|undefined {if(!selected)return;const video=videoId?selected.videos?.find(v=>v.id===videoId):undefined;return {key:progressKey(selected.type,videoId||selected.id),titleKey:progressKey(selected.type,selected.id),videoId:videoId||selected.id,episodeLabel:video?episodeLabel(selected,video):undefined};}
  function toggleWatched(videoId:string|undefined,watched:boolean) {const target=watchTarget(videoId);if(!target||!selected)return;const before={[target.key]:savedProgress(target.key)},label=videoId?target.episodeLabel:selected.name;setWatched([target],watched);notify(`${label} marked as ${watched?'watched':'unwatched'}`,()=>restoreProgress(before));}
  function markPreviousWatched(videoId?:string) {if(!selected)return;const targets=(videoId?episodesBefore(selected,videoId):(selected.videos??[]).filter(v=>v.episode!=null)).map(v=>({key:progressKey(selected.type,v.id),titleKey:progressKey(selected.type,selected.id),videoId:v.id,episodeLabel:episodeLabel(selected,v)})).filter(target=>!history[target.key]?.completed);if(!targets.length)return;const before=Object.fromEntries(targets.map(target=>[target.key,savedProgress(target.key)]));setWatched(targets);notify(`Marked ${targets.length} ${videoId?'earlier ':''}${targets.length===1?'episode':'episodes'} as watched`,()=>restoreProgress(before));}
  function markAllUnwatched() {if(!selected)return;const targets=(selected.videos??[]).filter(v=>v.episode!=null).map(v=>({key:progressKey(selected.type,v.id),titleKey:progressKey(selected.type,selected.id),videoId:v.id,episodeLabel:episodeLabel(selected,v)})).filter(target=>history[target.key]?.completed);if(!targets.length)return;const before=Object.fromEntries(targets.map(target=>[target.key,savedProgress(target.key)]));setWatched(targets,false);notify(`Marked ${targets.length} ${targets.length===1?'episode':'episodes'} as unwatched`,()=>restoreProgress(before));}
  function markSeasonWatched(season:number|undefined,watched:boolean) {if(!selected)return;const targets=(selected.videos??[]).filter(v=>v.episode!=null&&v.season===season).map(v=>({key:progressKey(selected.type,v.id),titleKey:progressKey(selected.type,selected.id),videoId:v.id,episodeLabel:episodeLabel(selected,v)})).filter(target=>watched?!history[target.key]?.completed:history[target.key]?.completed);if(!targets.length)return;const before=Object.fromEntries(targets.map(target=>[target.key,savedProgress(target.key)]));setWatched(targets,watched);const label=season==null?'Episodes':season===0?'Specials':'Season '+season;notify(label+' marked as '+(watched?'watched':'unwatched'),()=>restoreProgress(before));}
  function startPlayback(stream:Stream) {setAutoNext(undefined);setPlaying(stream);}
  function playEpisode(id:string) {if(!selected)return;setAutoNext(id);setPlaying(undefined);setStreams([]);setStreamError('');setStreamLoading(true);setEpisode(id);}
  function toggleSave(meta:Meta) { const index = library.findIndex(m => m.id === meta.id && m.type === meta.type); if (index < 0) { setLibrary(previous => [...previous,meta]); notify(`${meta.name} added to your library`); return; }
    const removed = library[index]; setLibrary(previous => previous.filter(m => m.id !== meta.id || m.type !== meta.type)); notify(`${meta.name} removed from your library`,() => setLibrary(previous => previous.some(m => m.id === removed.id && m.type === removed.type) ? previous : [...previous.slice(0,index),removed,...previous.slice(index)])); }
  function removeAddon(addon:Addon) { const index = addons.findIndex(a => a.manifest.id === addon.manifest.id); setAddons(previous => previous.filter(a => a.manifest.id !== addon.manifest.id)); notify(`${addon.manifest.name} removed`,() => setAddons(previous => previous.some(a => a.manifest.id === addon.manifest.id) ? previous : [...previous.slice(0,index),addon,...previous.slice(index)])); }
  async function install(input = installUrl) { setInstalling(true); setInstallError(''); try { const url = manifestUrl(input); const manifest = validateManifest(await getJson(url)); if (addons.some(a => a.manifest.id === manifest.id)) throw new Error('This extension is already installed.'); setAddons(previous => [...previous,{url,manifest,enabled:true}]); setInstallUrl(''); notify(`${manifest.name} installed`); } catch (e) { setInstallError(e instanceof Error ? e.message : 'Installation failed. Check the URL and CORS support.'); } finally { setInstalling(false); } }
  function exportFile() { const blob = new Blob([JSON.stringify(exportLibrary(library,addons),null,2)],{type:'application/json'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `hasimio-library-${new Date().toLocaleDateString('sv-SE')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000); notify(`Exported ${library.length} saved title${library.length === 1 ? '' : 's'}`); }
  async function importFile(file?: File) { if (!file) return; try { if (file.size > 10*1024*1024) throw new Error('Choose a Hasimio library export smaller than 10 MB.'); const merged = mergeLibrary({library,addons},parseLibrary(await file.text())); setLibrary(previous => mergeLibrary({library:previous,addons:[]},{library:merged.library,addons:[]}).library); setAddons(previous => mergeLibrary({library:[],addons:previous},{library:[],addons:merged.addons}).addons); notify(`Imported ${merged.added.titles} title${merged.added.titles === 1 ? '' : 's'} and ${merged.added.addons} extension${merged.added.addons === 1 ? '' : 's'}`); } catch (e) { notify(e instanceof Error ? e.message : 'Could not import this library.'); } }
  function refreshCalendar() {setCalendarRefresh(Date.now());}
  async function more(row:CatalogRow) {if(morePending.current.has(row.key))return undefined;morePending.current.add(row.key);const request=catalogRequest.current; try {const next = await loadCatalog(row.addon,row.catalog,query.trim(),row.skip); if (request !== catalogRequest.current) return; setCatalogs(previous => previous.map(c => c.key !== row.key ? c : {...next,items:[...new Map([...c.items,...next.items].map(m => [`${m.type}:${m.id}`,m])).values()],hasMore:next.hasMore && next.items.some(m => !c.items.some(old => old.id === m.id && old.type === m.type))}));return next.items.filter(m=>!row.items.some(old=>old.id===m.id&&old.type===m.type));} catch {return undefined;} finally {morePending.current.delete(row.key);}}
  const filtered = (items:Meta[]) => items.filter(m => `${m.type}:${m.id}` !== spotlightKey).filter(m => (filter === 'All' || (filter === 'Anime' ? mediaLabel(m) === 'Anime' : m.type === (filter === 'Movies' ? 'movie' : 'series'))) && (genre === 'All genres' || m.genres?.includes(genre)));
  const saved = (meta:Meta) => library.some(m => m.id === meta.id && m.type === meta.type);
  const allGenres = [...new Set([...demo,...catalogs.flatMap(c => c.items),...library].flatMap(m => m.genres ?? []))].sort();
  const localRows = page === 'Library' ? [{title:'Your collection',items:library.filter(m => !query.trim() || m.name.toLowerCase().includes(query.trim().toLowerCase()))}] : [...(!loading && !catalogs.length && filter !== 'Anime' ? [{title:'Starter picks · Offline selection',items:demo.filter(m => !query.trim() || m.name.toLowerCase().includes(query.trim().toLowerCase()))}] : []),...(addons.some(a => a.builtin && a.enabled) && !query.trim() ? [{title:'Open Cinema · Ready to play',items:openFilms}] : [])];
  useEffect(()=>storeProgressTitles(progressMetadata),[progressMetadata]);
  const knownTitles = useMemo(() => {const known=[...progressMetadata,...library,...catalogs.flatMap(c => c.items),...demo,...openFilms];return [...known,...progressTitleSeeds(history,known)];},[progressMetadata,catalogs,library,history]);
  const progressLookupKey=JSON.stringify([...new Set(Object.entries(history).map(([key,p])=>p.titleKey??key))].sort());
  const progressKnownKey=JSON.stringify([...new Set(knownTitles.map(meta=>progressKey(meta.type,meta.id)))].sort());
  useEffect(()=>{
    if(page!=='Progress'){setProgressLoading(false);return;}
    const controller=new AbortController();let live=true;
    const force=progressRefreshApplied.current!==progressRefresh;progressRefreshApplied.current=progressRefresh;
    const tracked=new Set<string>(JSON.parse(progressLookupKey));
    const known=new Map<string,Meta>();
    for(const meta of knownTitles){const key=progressKey(meta.type,meta.id),previous=known.get(key);if(!previous||(meta.videos?.length??0)>(previous.videos?.length??0))known.set(key,meta);}
    const needsRuntime=(key:string,meta:Meta)=>Object.entries(history).some(([entryKey,p])=>
      (p.titleKey??entryKey)===key&&p.completed&&p.manual&&p.duration<=1&&
      !runtimeSeconds(meta.runtime)&&!runtimeSeconds(meta.videos?.find(video=>video.id===p.videoId||progressKey(meta.type,video.id)===entryKey)?.runtime));
    const queue=[...known].filter(([key,meta])=>tracked.has(key)&&(force||needsRuntime(key,meta)||(meta.type!=='movie'&&!meta.videos?.length)||needsMetadata(meta))).map(([,meta])=>meta);
    setProgressLoading(queue.length>0);
    async function worker(){while(queue.length&&live){const meta=queue.shift()!;try{
      const updated=await loadMetadata(meta,addons,controller.signal);
      if(live)setProgressMetadata(previous=>[...previous.filter(item=>item.id!==updated.id||item.type!==updated.type),updated]);
    }catch{if(controller.signal.aborted)return;}}}
    void Promise.all(Array.from({length:Math.min(3,queue.length)},worker)).then(()=>{if(live)setProgressLoading(false);});
    return()=>{live=false;controller.abort();};
    // Metadata writes do not restart this batch; identity changes and explicit retries do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[page,addons,progressLookupKey,progressKnownKey,progressRefresh]);
  const continueItems = useMemo(() => continueWatching(history,knownTitles),[history,knownTitles]);
  const continueRow = query.trim() ? [] : [{title:'Continue watching',key:'continue',items:page === 'Library' ? continueItems.filter(saved) : continueItems}].filter(row => row.items.length);
  const topRow = query.trim() && page !== 'Library' ? [{title:'Top results',key:'top',source:'Best matches',items:topResults(catalogs,query)}].filter(row => row.items.length > 1) : [];
  const allRows:{title:string;items:Meta[];key?:string;source?:string;hasMore?:boolean}[] = page === 'Library' ? [...continueRow,...localRows] : [...continueRow,...topRow,...catalogs,...localRows];
  const collectionRow=page==='Discover'?allRows.find(row=>(row.key||row.title)===collectionKey):undefined;
  const rows=collectionRow?[collectionRow]:allRows;
  // The spotlight follows what you are watching, then live catalogs; the starter pick only covers offline use.
  const resuming = continueItems.find(m => safeHttp(m.background));
  const featured = resuming ?? catalogs.flatMap(c => c.items).find(m => safeHttp(m.background) && m.description) ?? (loading ? undefined : demo[0]);
  const featuredProgress = featured && titleProgress(featured,history);
  // The spotlight title is not repeated in the shelves right below it.
  const activeRow=rows.find(row=>(row.key||row.title)===browseRow);
  const browseItems=activeRow?filteredForBrowse(activeRow.items):[];
  function filteredForBrowse(items:Meta[]){return items.filter(m=>(filter==='All'||(filter==='Anime'?mediaLabel(m)==='Anime':m.type===(filter==='Movies'?'movie':'series')))&&(genre==='All genres'||m.genres?.includes(genre)));}
  const browseIndex=selected?browseItems.findIndex(m=>m.id===selected.id&&m.type===selected.type):-1;
  async function browseTitle(direction:number){
    if(browsing)return;
    const target=browseItems[browseIndex+direction];
    if(target){void open(target);return;}
    if(direction>0&&activeRow?.hasMore){
      const catalog=catalogs.find(row=>row.key===activeRow.key);if(!catalog)return;
      setBrowsing(true);const request=detailRequest.current;
      try{const added=await more(catalog);const next=added&&filteredForBrowse(added)[0];if(request===detailRequest.current&&dialog.current?.open){if(next)void open(next);else if(!added)notify('Could not load the next titles. Try again.');}}finally{setBrowsing(false);}
    }
  }
  const spotlightKey = page === 'Discover' && !query && filter === 'All' && featured && featured !== resuming ? `${featured.type}:${featured.id}` : '';
  const quickSource = useMemo(() => bestSource(streams),[streams]);
  const currentProgress = selected && history[progressKey(selected.type,episode || selected.id)];
  const currentVideo = selected?.videos?.find(v => v.id === episode);
  const upcoming = selected && episode ? nextEpisode(selected,episode) : undefined;
  const nextUp = selected && upcoming ? {label:episodeLabel(selected,upcoming),title:upcoming.title || upcoming.name,thumbnail:upcoming.thumbnail || selected.background,onPlay:()=>playEpisode(upcoming.id)} : undefined;
  // A modal dialog sits in the top layer, so the toast must render inside it while details are open.
  const toast = notice && <div className="toast" role="status" onMouseEnter={() => setNoticeHeld(true)} onMouseLeave={() => setNoticeHeld(false)} onFocus={() => setNoticeHeld(true)} onBlur={() => setNoticeHeld(false)}><Check size={17}/>{notice.text}{notice.undo && <button className="toast-action" onClick={() => {notice.undo?.();setNotice(undefined);setNoticeHeld(false);}}>Undo</button>}</div>;
  const playLabel =`${currentProgress && !currentProgress.completed && currentProgress.position > 0 ? 'Resume' : 'Play'}${selected && currentVideo ? ` ${episodeLabel(selected,currentVideo)}` : ''}`;
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#" onClick={e => {e.preventDefault();setPage('Discover');}}><span className="brand-symbol"><Play size={21} fill="currentColor"/></span>hasimio<span className="brand-dot">.</span></a><nav aria-label="Main">{[{name:'Discover',icon:Compass},{name:'Live TV',icon:Tv,short:'Live'},{name:'Library',icon:Library},{name:'Progress',icon:BarChart3,short:'Stats'},{name:'Calendar',icon:CalendarDays},{name:'Extensions',icon:Puzzle,short:'Add-ons'},{name:'Sync devices',icon:MonitorSmartphone,short:'Sync'}].map(({name,icon:Icon,short}) => <button key={name} aria-label={name} className={`nav-item ${(page === name||page==='Actor'&&name==='Discover') ? 'active' : ''}`} onClick={() => { setPage(name); setCollectionKey(undefined); setQuery(''); setProgressQuery(''); setFilter('All'); setGenre('All genres'); }}><Icon size={20}/><span data-short={short}>{name}</span>{name === 'Library' && library.length > 0 && <small>{library.length}</small>}{name === 'Extensions' && <small>{addons.length}</small>}</button>)}</nav><div className="sidebar-bottom"><button className={`sync-status ${sync.state}`} onClick={() => setPage('Sync devices')}><i aria-hidden="true"/>{syncLabel}</button><div className="version">HASIMIO <span>v{appVersion}</span></div></div></aside>
    <main><header className="topbar"><a className="topbar-brand" href="#" aria-label="Hasimio home" onClick={e => {e.preventDefault();setPage('Discover');}}><span className="brand-symbol"><Play size={19} fill="currentColor"/></span></a><label className="search"><Search size={17}/><input aria-label={page==='Progress'?'Search within Progress':'Search titles or actors'} placeholder={page==='Progress'?'Search within Progress…':'Search titles or actors…'} value={page==='Progress'?progressQuery:query} onChange={e => {const value=e.target.value;setCollectionKey(undefined);if(page==='Progress'){setProgressQuery(value);return;}setQuery(value);if(value.trim()){setPage('Discover');if(!query.trim() || page !== 'Discover'){setFilter('All');setGenre('All genres');}}}}/>{(page==='Progress'?progressQuery:query) && <button onClick={() => page==='Progress'?setProgressQuery(''):setQuery('')} aria-label="Clear search"><X size={15}/></button>}<kbd>/</kbd></label></header>
    <div className="page-content">
      <UpdateBanner state={update}/>
      {page === 'Discover' && !collectionRow && !query && filter === 'All' && (featured ? <section className="hero" key={`${featured.type}:${featured.id}`}><img className="hero-backdrop" src={safeHttp(featured.background)} alt="" onError={e => e.currentTarget.style.visibility='hidden'}/><div className="hero-shade"/><div className="hero-content"><span className="hero-kicker">{featured === resuming ? `Continue watching${featuredProgress?.episode ? ` · ${featuredProgress.episode}` : ''}` : 'Featured pick'}</span><h1 className={featured.name.length > 6 ? 'long' : ''}>{featured.name}</h1><div className="hero-meta">{featured.imdbRating && <span className="rating">★ {featured.imdbRating}</span>}{featured.releaseInfo && <span>{featured.releaseInfo}</span>}{featured.runtime && <span>{featured.runtime}</span>}<span>{mediaLabel(featured)}</span>{featured.genres?.[0] && <span>{featured.genres[0]}</span>}</div>{featured.description && <p>{featured.description}</p>}<div className="hero-actions"><button className="button primary" onClick={() => open(featured)}>{featured === resuming ? <><Play size={17} fill="currentColor"/> Resume</> : <><Info size={18}/> Details</>}</button><button className={`button secondary ${saved(featured) ? 'is-saved' : ''}`} onClick={() => toggleSave(featured)}>{saved(featured) ? <Check size={18}/> : <Plus size={18}/>} {saved(featured) ? 'In your library' : 'Add to library'}</button></div></div>{featured === resuming && featuredProgress && !featuredProgress.completed && <div className="hero-progress" aria-hidden="true"><span style={{width:`${featuredProgress.percent}%`}}/></div>}</section> : loading && <section className="hero hero-placeholder" aria-hidden="true"/>)}
      {(page === 'Discover' || page === 'Library') && <>{(query || page === 'Library') && <div className="section-intro"><h1>{query ? `Results for “${query}”` : 'Library'}</h1>{page === 'Library' && <div className="library-actions"><span className="count-label">{library.length} saved title{library.length === 1 ? '' : 's'}</span><button className="button secondary" onClick={exportFile} disabled={!library.length}><Download size={16}/> Export</button><button className="button secondary" onClick={() => importInput.current?.click()}><Upload size={16}/> Import</button><input ref={importInput} type="file" accept=".json,application/json" hidden aria-label="Import library file" onChange={e => {void importFile(e.target.files?.[0]);e.currentTarget.value='';}}/></div>}</div>}<div className="filter-bar"><div className="segmented">{['All','Movies','Series','Anime'].map(item => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="filters"><SlidersHorizontal size={15}/><select aria-label="Filter by genre" value={genre} onChange={e => setGenre(e.target.value)}><option>All genres</option>{allGenres.map(g => <option key={g}>{g}</option>)}</select><button className="icon-button" onClick={() => setRefresh(n => n+1)} aria-label="Refresh catalogs"><RefreshCw size={16} className={loading ? 'spin' : ''}/></button></div></div>
      {!addons.some(a => a.manifest.id === titles.manifest.id) && page === 'Discover' && <div className="source-banner"><span className="small-puzzle"><Puzzle size={18}/></span><p><strong>Make room for more.</strong> Add Hasimio Titles for live movie and series catalogs. Featured picks below are a starter selection.</p><button onClick={() => setAddons(previous => replaceCinemeta(previous))}>Add catalog<ArrowUpRight size={15}/></button></div>}{installError && page === 'Discover' && <p className="error" role="alert">{installError}</p>}{catalogError && <p className="error" role="alert">{catalogError}</p>}
      {loading && <div className="loading" role="status"><LoaderCircle className="spin" size={17}/> {query.trim() ? 'Searching titles…' : 'Loading catalogs…'}</div>}
      {page==='Discover'&&query.trim()&&<ActorSearch query={query.trim()} onSelect={openActor}/>}
      {rows.map(row => filtered(row.items).length ? <MediaShelf key={row.key || row.title} title={row.title} source={row.source} expanded={!!collectionRow} onBrowse={page==='Discover'&&!collectionRow?()=>{collectionScroll.current=window.scrollY;setCollectionKey(row.key||row.title);window.scrollTo({top:0,behavior:'instant'});}:undefined} onBack={collectionRow?()=>{setCollectionKey(undefined);requestAnimationFrame(()=>window.scrollTo({top:collectionScroll.current,behavior:'instant'}));}:undefined} wrap={!!(collectionRow || (page === 'Library' && row.key !== 'continue') || query)} hasMore={row.hasMore} onMore={async()=>{const catalog=catalogs.find(c=>c.key===row.key);return catalog?!!await more(catalog):false;}}>{filtered(row.items).map(meta=><Poster key={meta.type+':'+meta.id} progress={titleProgress(meta,history)} meta={meta} saved={saved(meta)} onClick={()=>{setBrowseRow(row.key||row.title);void open(meta);}}/>)}</MediaShelf> : null)}
      {!loading && !rows.some(row => filtered(row.items).length) && <div className="empty-state"><Library size={38}/><h3>{page === 'Library' && !library.length ? 'Your next obsession belongs here' : catalogError ? 'Search could not finish' : 'No titles found'}</h3><p>{page === 'Library' && !library.length ? 'Save a movie or series from Discover to start your collection.' : catalogError ? 'The catalog is unavailable. Retry to search again.' : 'Try another title, genre, or media type.'}</p><button className="button primary" onClick={() => {if(catalogError){setRefresh(n=>n+1);return;}setPage('Discover');setQuery('');setFilter('All');setGenre('All genres');}}>{catalogError ? 'Retry search' : 'Explore titles'}</button></div>}</>}
      {page==='Actor'&&actor&&<ActorTitles person={actor} saved={saved} onOpen={open} onBack={()=>setPage('Discover')}/>}
      {page === 'Live TV' && <LiveTV/>}
      {page === 'Sync devices' && <SyncDevices/>}
      {page === 'Progress' && <Progress onImported={(items,message)=>{setProgressMetadata(previous=>[...previous,...items.filter(item=>!previous.some(meta=>meta.id===item.id&&meta.type===item.type))]);notify(message);}} searchQuery={progressQuery} onSearchChange={setProgressQuery} loading={progressLoading} onRefresh={()=>setProgressRefresh(value=>value+1)} history={history} titles={knownTitles} onOpen={open} onDiscover={() => setPage('Discover')}/>}
      {page === 'Calendar' && <Calendar library={library} syncing={calendarLoading} onRefresh={refreshCalendar} onOpen={open} onDiscover={() => setPage('Discover')}/>}
      {page === 'Extensions' && <><div className="section-intro"><h1>Extensions</h1><span className="count-label">{addons.filter(a => a.enabled).length} of {addons.length} active</span></div><UpdatePanel state={update}/><EnginePanel engine={engine}/><div className="extension-list">{addons.map(addon => <article className="extension-item" key={addon.manifest.id}><div className={`extension-logo ${addon.builtin ? 'orange' : ''}`}>{addon.builtin ? <Film size={25}/> : <Puzzle size={25}/>}</div><div className="extension-info"><h3>{addon.manifest.name}<span>v{addon.manifest.version}</span></h3><p>{addon.manifest.description}</p><div className="resource-tags">{addon.manifest.resources.map(r => typeof r === 'string' ? r : r.name).map(r => <span key={r}>{r}</span>)}</div></div><div className="extension-controls"><button role="switch" aria-checked={addon.enabled} aria-label={`Enable ${addon.manifest.name}`} className={`switch ${addon.enabled ? 'on' : ''}`} onClick={() => setAddons(previous => previous.map(a => a.manifest.id === addon.manifest.id ? {...a,enabled:!a.enabled} : a))}><span/></button>{!addon.builtin && <button className="icon-button" aria-label={`Remove ${addon.manifest.name}`} onClick={() => removeAddon(addon)}><Trash2 size={17}/></button>}</div></article>)}</div><section className="install-panel"><div className="extension-intro-icon"><Puzzle size={28}/></div><div><h3>Add an extension</h3><p>Paste a Stremio-compatible manifest URL. Only install sources you trust: they receive your catalog and playback requests.</p><form className="install-form" onSubmit={e => {e.preventDefault();install();}}><input type="url" required aria-label="Extension manifest URL" placeholder="https://your-extension.com/manifest.json" value={installUrl} onChange={e => setInstallUrl(e.target.value)}/><button className="button primary" disabled={installing || !installUrl.trim()}>{installing ? <LoaderCircle className="spin" size={17}/> : <Plus size={17}/>} Install extension</button></form>{installError && <p className="error" role="alert">{installError} The source must allow browser requests (CORS).</p>}</div></section>{!addons.some(a => a.manifest.id === titles.manifest.id) && <section className="recommended-extension"><div><h3>Hasimio Titles</h3><p>Hasimio’s own movie and series catalogs, built locally from IMDb’s public datasets, with Wikipedia movie posters and TVmaze series artwork and air dates.</p><a href="https://developer.imdb.com/non-commercial-datasets/" target="_blank" rel="noreferrer">About the IMDb datasets <ExternalLink size={13}/></a></div><button className="button secondary" onClick={() => setAddons(previous => replaceCinemeta(previous))}><Plus size={17}/> Add Hasimio Titles</button></section>}<p className="extension-footnote">Extensions connect to external services. Availability, content, and stream quality are managed by each provider. The Pirate Bay, YTS, EZTV, TorrentDownloads, TorrentClaw, and Torrentio use Hasimio’s local torrent service. Playback depends on available peers and browser codec support; closing the player stops the torrent and clears temporary data.</p></>}
    </div></main>
    <dialog aria-label={selected?.name || 'Media details'} ref={dialog} onCancel={closeDetail} onClick={e => {if (e.target === e.currentTarget) closeDetail();}} onScroll={e => {const past = e.currentTarget.scrollTop > 160; if (past !== dialogScrolled) setDialogScrolled(past);}} className={`detail-dialog ${playing?'playback-dialog':''} ${dialogScrolled && !playing ? 'scrolled' : ''}`}>{selected && <>{!playing && <div className="dialog-bar"><strong aria-hidden="true">{selected.name}</strong>{browseIndex>=0&&<div className="detail-browse" aria-label="Browse titles"><button className="icon-button" aria-label="Previous title" disabled={browsing||browseIndex===0} onClick={()=>void browseTitle(-1)}><ChevronLeft size={20}/></button><button className="icon-button" aria-label="Next title" disabled={browsing||browseIndex===browseItems.length-1&&!activeRow?.hasMore} onClick={()=>void browseTitle(1)}>{browsing?<LoaderCircle size={18} className="spin"/>:<ChevronRight size={20}/>}</button></div>}<button className="icon-button close-dialog" onClick={closeDetail} aria-label="Close details"><X/></button></div>}{playing ? playing.infoHash ? <TorrentPlayer episodeLabel={selected.videos?.find(v=>v.id===episode)?episodeLabel(selected,selected.videos.find(v=>v.id===episode)!):undefined} key={progressKey(selected.type,episode||selected.id)} progressKey={progressKey(selected.type,episode||selected.id)} titleKey={progressKey(selected.type,selected.id)} title={selected.name} stream={playing} videoId={episode || selected.id} next={nextUp} onClose={() => setPlaying(undefined)}/> : <Player episodeLabel={selected.videos?.find(v=>v.id===episode)?episodeLabel(selected,selected.videos.find(v=>v.id===episode)!):undefined} key={progressKey(selected.type,episode||selected.id)} progressKey={progressKey(selected.type,episode||selected.id)} titleKey={progressKey(selected.type,selected.id)} videoId={episode||selected.id} title={selected.name} stream={playing} next={nextUp} onClose={() => setPlaying(undefined)}/> : <><div className={`detail-art ${safeHttp(selected.background) ? '' : 'empty'}`} style={safeHttp(selected.background) ? {backgroundImage:`linear-gradient(0deg,#242424,transparent),url("${safeHttp(selected.background)}")`} : undefined}/><div className="detail-content"><div className={`detail-heading ${posterSources(selected).length ? '' : 'no-poster'}`}>{posterSources(selected).length > 0 && <div className="detail-poster"><PosterImage meta={selected} loading="eager"/></div>}<div className="detail-title"><h2>{selected.name}</h2><p>{[selected.releaseInfo,selected.runtime,mediaLabel(selected),selected.imdbRating && `★ ${selected.imdbRating}`].filter(Boolean).join(' · ')}</p></div><div className="detail-actions"><button className="button primary" disabled={!quickSource} onClick={() => quickSource && startPlayback(quickSource)}>{streamLoading && !quickSource ? <LoaderCircle className="spin" size={17}/> : <Play size={17} fill="currentColor"/>} {streamLoading && !quickSource ? 'Finding sources…' : quickSource ? playLabel : 'No playable source'}</button><button className="button secondary" onClick={() => toggleSave(selected)}>{saved(selected) ? <Check size={18}/> : <Plus size={18}/>} {saved(selected) ? 'Saved' : 'Save'}</button>{selected.type === 'movie' && <button className={`button secondary ${currentProgress?.completed ? 'is-saved' : ''}`} aria-pressed={!!currentProgress?.completed} onClick={() => toggleWatched(undefined,!currentProgress?.completed)}>{currentProgress?.completed ? <Check size={18}/> : <CircleCheck size={18}/>} {currentProgress?.completed ? 'Watched' : 'Mark as watched'}</button>}</div></div><p className="description">{selected.description || 'Install a metadata extension to load the full description and episode information.'}</p><div className="resource-tags">{selected.genres?.map(g => <span key={g}>{g}</span>)}</div><TitleCast meta={selected} onSelect={openActor}/>{detailLoading && <p className="loading"><LoaderCircle className="spin" size={16}/> Loading details…</p>}{selected.type !== 'movie' && <EpisodeList meta={selected} episode={episode} history={history} onSelect={chooseEpisode} onToggleWatched={toggleWatched} onMarkPrevious={markPreviousWatched} onMarkAll={()=>markPreviousWatched()} onMarkAllUnwatched={markAllUnwatched} onMarkSeason={markSeasonWatched}/>}<StreamPicker videoId={episode || selected.id} key={`${selected.type}:${selected.id}:${episode || ""}`} streams={streams} loading={streamLoading} error={streamError} onPlay={startPlayback} onRetry={() => setRefresh(n => n+1)} onManage={() => {closeDetail();setPage("Extensions");}}/></div></>}</>}{selected && toast}</dialog>
    {!selected && toast}
  </div>;
}


