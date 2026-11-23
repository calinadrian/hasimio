import {currentProfile,requestProfilePicker} from './profile-storage';
import {profileStorage} from './profile-storage';
import {searchStreams,SOURCE_TIMEOUT_MS} from './stream-search';
import {playsThroughEngine} from './debrid';
import {cachedStreams,forgetStreams,storeStreams,streamCacheKey} from './stream-cache';
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {version as appVersion} from '../package.json';

import { Compass, Library, CalendarDays, Puzzle, Search, Play, Plus, Check, ChevronLeft, ChevronRight, X, ArrowUpRight, Film, Info, RefreshCw, ExternalLink, Trash2, LoaderCircle, Download, Upload, MonitorSmartphone, CircleCheck, BarChart3, Tv, ListVideo, Settings as SettingsIcon } from 'lucide-react';
import { type Meta, type Addon, type Stream, demo, openFilms, getJson, manifestUrl, validateManifest, resourceUrl, supports, demoStreams, safeHttp, datedVideos, nextRelease, episodeLabel } from './media';
import {groupAnimeSeries, imdbAnimeCandidate, mergeImdbAnime, sameTitle, updateTitle} from './anime-series';
import {cachedHomeRows,cachedRow,mergeRows,storeHomeRows} from './home-cache';
import {removeBundledTitle, topResults, defaultAddons, migrateAnimeSource, addDefaultCatalogs, updatePlaybackAddon, type CatalogRow, catalogSelection, findImdbAnime, kitsu, loadCatalog, loadMetadata, needsMetadata, titles, replaceCinemeta, sourceMigrations} from './catalogs';
import {defaultEpisode} from './media';
import PosterImage from './PosterImage';
import {backdropSources,posterSources,useImage} from './poster-artwork';
import {featuredCandidates,popularRow,useFeatured} from './featured';
import {ProfileMenu,TopNavigation} from './TopNavigation';
import HoverPreview from './HoverPreview';
import {ActorSearch,ActorTitles,TitleCast,type Person} from './People';
import {cachedProgressTitles,storeProgressTitles,progressTitleSeeds} from './progress-titles';
import {usePlayerSettings} from './use-player-settings';
import DesktopTitleBar from './DesktopTitleBar';
import {runtimeSeconds} from './watch-time';
import TorrentPlayer from './TorrentPlayer';
import PlaybackLoading from './PlaybackLoading';
import StreamPicker, {type EpisodeWait} from './StreamPicker';
import { EnginePanel, useEngine } from './EngineStatus';
import { UpdateBanner, UpdatePanel, useUpdates } from './DesktopUpdates';
import { exportLibrary, mergeLibrary, parseLibrary } from './library-transfer';
import './styles.css';
// Secondary tabs load on first visit; the TV parses far less JavaScript at startup.
const Calendar = React.lazy(() => import('./Calendar'));
const Progress = React.lazy(() => import('./Progress'));
const LiveTV = React.lazy(() => import('./LiveTV'));
const Settings = React.lazy(() => import('./Settings'));
const SyncDevices = React.lazy(() => import('./SyncDevices'));
import './shell.css';
import Player from './Player';
import {canonicalHistory,upgradeCreditsBookmarks,progressKey,subscribeProgress,progressSnapshot,playbackHistory,titleProgress,continueWatching,savedProgress,setWatched,restoreProgress,episodesBefore,nextEpisodeToWatch,type WatchTarget} from './playback-progress';
import {rankSources,usableSource} from './stream-options';
import {subscribeTrackChanges,trackRevision} from './playback-tracks';
import {useQuickTrackInspection} from './source-inspection';
import {quickPlayDecision,QUICK_PLAY_GRACE_MS,playbackSourceKey,recoverPlayback,type PlaybackAttempt,type PlaybackStartup} from './quick-play';
import {adjacentEpisodes} from './next-episode';
import Poster,{WideCard} from './Poster';
import Hero from './Hero';
import SearchKeyboard from './webos/SearchKeyboard';
import MediaShelf from './MediaShelf';
import CardSizeControl from './CardSizeControl';
import {useCardSize} from './card-size';
import Description from './Description';
import EpisodeList from './EpisodeList';
import {deviceSync,useDeviceSync} from './device-sync';
import {isWebOS} from './webos/platform';
import {isAndroid,isAndroidArm32} from './android/platform';
import TVStoragePanel from './webos/StoragePanel';
import {prefetchLiveSeeders,useLiveSeeders,withLiveSeeders} from './webos/live-seeders';
import MobileNavigation from './android/MobileNavigation';
import './android/mobile.css';
import './home.css';
export {Player};

function read<T,>(key: string, fallback: T): T { try { const data = JSON.parse(profileStorage.getItem(key) ?? 'null'); return Array.isArray(data) ? data as T : fallback; } catch { return fallback; } }
function useSaved<T,>(key: string, initial: T) { const [value, set] = useState<T>(() => read(key, initial)); useEffect(() => { try { const text=JSON.stringify(value);if(profileStorage.getItem(key)!==text){profileStorage.setItem(key,text);window.dispatchEvent(new Event('hasimio:local-data'));} } catch { /* UI continues when storage is full or blocked. */ } }, [value,key]); useEffect(()=>{const update=()=>set(previous=>{const next=read(key,initial);return JSON.stringify(next)===JSON.stringify(previous)?previous:next;});window.addEventListener('hasimio:remote-data',update);return()=>window.removeEventListener('hasimio:remote-data',update);},[key]); return [value,set] as const; }
function mediaLabel(meta:Meta) { return meta.category === 'anime' || meta.type === 'anime' ? 'Anime' : meta.type === 'series' ? 'Series' : 'Movie'; }
// Computers get a top bar and hover cards; the TV keeps its rail, Android its own navigation.
const topNavigation = !isWebOS && !isAndroid;
const hoverCards = topNavigation && typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
/** Past this scroll position the top bar turns solid over the billboard. */
const SOLID_TOPBAR_AT = 40;
export default function App() {
  const preferences=usePlayerSettings();
  const progressVersion=useSyncExternalStore(subscribeProgress,progressSnapshot);
  const storedHistory=useMemo(()=>playbackHistory(progressVersion),[progressVersion]);
  useEffect(()=>{upgradeCreditsBookmarks();deviceSync.start();},[]);
  const cardSize=useCardSize();
  useEffect(()=>{if(!isWebOS)return;const frame=requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('nav button.active')?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[]);
  const [actor,setActor]=useState<Person>();
  function openActor(person:Person){closeDetail();setActor(person);setCollectionKey(undefined);setBrowseRow(undefined);setPage('Actor');setQuery('');window.scrollTo({top:0,behavior:'instant'});}
  const [collectionKey,setCollectionKey]=useState<string>();
  const collectionScroll=useRef(0);
  const [browseRow,setBrowseRow]=useState<string>();
  const [browsing,setBrowsing]=useState(false);
  const morePending=useRef(new Set<string>());
  const [progressQuery,setProgressQuery]=useState('');
  const [librarySort,setLibrarySort]=useState<'added'|'watched'|'name'|'year'>('added');
  const [libraryStatus,setLibraryStatus]=useState<'all'|'watching'|'unstarted'|'finished'>('all');
  const [page,setPage] = useState(()=>location.hash.startsWith('#sync-link=')||/^\/connect(?:\.html)?\/?$/.test(location.pathname)?'Sync devices':'Discover'); const [query,setQuery] = useState(''); const [filter,setFilter] = useState('All'); const [genre,setGenre] = useState('All genres');
  const [savedAddons,setAddons] = useSaved<Addon[]>('hasimio:addons', defaultAddons);
  const addons = useMemo(()=>migrateAnimeSource(savedAddons),[savedAddons]); const [library,setLibrary] = useSaved<Meta[]>('hasimio:library', []);
  useEffect(() => {setAddons(previous => updatePlaybackAddon(migrateAnimeSource(previous)));},[setAddons]);
  const [catalogs,setCatalogs] = useState<CatalogRow[]>(()=>cachedHomeRows(addons)); const [loading,setLoading] = useState(false); const [catalogError,setCatalogError] = useState(''); const [refresh,setRefresh] = useState(0); const [streamRefresh,setStreamRefresh] = useState(0); const [catalogsStale,setCatalogsStale] = useState(false); const [queueTick,setQueueTick] = useState(0);
  const [calendarLoading,setCalendarLoading] = useState(false); const [calendarRefresh,setCalendarRefresh] = useState(0); const [clockTick,setClockTick] = useState(0);
  const progressRefreshApplied=useRef(0);
  const [progressMetadata,setProgressMetadata]=useState<Meta[]>(cachedProgressTitles);const history=useMemo(()=>canonicalHistory(storedHistory,[...progressMetadata,...library]),[storedHistory,progressMetadata,library]);const [progressLoading,setProgressLoading]=useState(false);const [progressRefresh,setProgressRefresh]=useState(0);
  const [selected,setSelected] = useState<Meta>(); const [detailLoading,setDetailLoading] = useState(false); const [streams,setStreams] = useState<Stream[]>([]); const [streamLoading,setStreamLoading] = useState(false); const [streamsFor,setStreamsFor] = useState(''); const [streamError,setStreamError] = useState(''); const [episode,setEpisode] = useState<string>(); const [queuedEpisode,setQueuedEpisode] = useState<string>(); const [quickPlay,setQuickPlay]=useState<string>();
  // TV: the source list stays behind "Other sources"; Play picks one by itself.
  // TV: OK on the search bar opens Hasimio's own keyboard (webos/SearchKeyboard.tsx).
  const [tvKeyboard,setTvKeyboard]=useState(false);
  const [sourcesOpen,setSourcesOpen]=useState(false); const playOnly=useRef(false); const opener=useRef<HTMLElement|null>(null);
  const [playback,setPlayback]=useState<PlaybackAttempt>(); const playing=playback?.stream; const [installUrl,setInstallUrl] = useState(''); const [installing,setInstalling] = useState(false); const [installError,setInstallError] = useState(''); const [notice,setNotice] = useState<{text:string;undo?:()=>void}>(); const [noticeHeld,setNoticeHeld] = useState(false); const [dialogScrolled,setDialogScrolled] = useState(false);
  const notify = (text:string,undo?:()=>void) => setNotice({text,undo});
  const sync = useDeviceSync(); const syncLabel = sync.state === 'off' ? 'Saved on this device' : sync.state === 'syncing' || (sync.state === 'ready'&&sync.pending) ? 'Syncing…' : sync.state === 'offline' ? 'Sync offline' : sync.state === 'revoked' ? 'Sync disconnected' : `Synced · ${sync.devices.length} device${sync.devices.length === 1 ? '' : 's'}`;
  const engine = useEngine(); const update = useUpdates(); const importInput = useRef<HTMLInputElement>(null);
  const detailAbort=useRef<AbortController>(undefined); const detailCache=useRef(new Map<string,Meta>());
  const detailRequest = useRef(0); const provisionalEpisode = useRef<string>(undefined); const streamRequest = useRef(0); const catalogRequest = useRef(0); const catalogSearching = useRef(false); const staleRows = useRef(false); const engineDown = useRef(false); const queuedSince = useRef<{id:string;at:number}>(undefined);
  const retryStreams = useCallback(() => {forgetStreams();setStreamRefresh(n => n+1);},[]);
  // Catalogs that failed while the local engine was still starting load by themselves once it answers.
  useEffect(() => { if (engine.state === 'missing' || engine.state === 'outdated') engineDown.current = true; else if (engine.state === 'ready' && engineDown.current) { engineDown.current = false; setRefresh(n => n+1); } },[engine.state]); const dialog = useRef<HTMLDialogElement>(null);
  // Earlier versions saved a bundled Insula Iubirii entry into every library; take it back out once.
  useEffect(() => {try {if(profileStorage.getItem('hasimio:manual-insula-iubirii-v1') === 'done'){setLibrary(removeBundledTitle);profileStorage.setItem('hasimio:manual-insula-iubirii-v1','removed');}}catch{/* Storage is blocked; nothing was added either. */}},[setLibrary]);
  useEffect(() => {for (const [flag,apply] of sourceMigrations) {try {if(profileStorage.getItem(flag) !== 'done'){setAddons(apply);profileStorage.setItem(flag,'done');}}catch{/* New sessions still receive the default sources. */}}},[setAddons]);
  useEffect(() => {window.scrollTo(0,0);},[page]);
  const searchPage = page === 'Discover' || page === 'Library' || page === 'Progress';
  useEffect(() => {if (!searchPage) setTvKeyboard(false);},[searchPage]);
  useEffect(() => {
    if (!isWebOS) return;
    const show = () => {setTvKeyboard(true);window.scrollTo(0,0);requestAnimationFrame(()=>(document.querySelector<HTMLElement>('.tv-keyboard [data-last]') ?? document.querySelector<HTMLElement>('.tv-keyboard .tv-key'))?.focus());};
    document.addEventListener('hasimio:search-keyboard',show);return () => document.removeEventListener('hasimio:search-keyboard',show);
  },[]);
  const libraryKeys = library.map(m => `${m.type}:${m.id}`).sort().join('|');
  useEffect(() => { try { if (profileStorage.getItem('hasimio:default-catalogs-v1') !== 'done') { setAddons(previous => addDefaultCatalogs(previous)); profileStorage.setItem('hasimio:default-catalogs-v1','done'); } } catch { /* Defaults are still supplied on a new session when storage is blocked. */ } },[setAddons]);
  useEffect(() => { const update = () => { if (document.visibilityState === 'visible') setClockTick(n => n+1); }; const interval = setInterval(update,15*60*1000); document.addEventListener('visibilitychange',update); return () => {clearInterval(interval);document.removeEventListener('visibilitychange',update);}; },[]);
  useEffect(() => {
    const controller = new AbortController(); let live = true;
    const queue = library.filter(meta => calendarRefresh > (meta.metadataFetchedAt ?? 0) || needsMetadata(meta) || (meta.metadataError && addons.some(a => supports(a,'meta',meta.type,meta.id))));
    setCalendarLoading(queue.length > 0);
    // Bound concurrency so restoring a large library does not flood metadata providers.
    async function worker() { while (queue.length && live) { const meta = queue.shift()!; try { const updated = await loadMetadata(meta,addons,controller.signal); if (live) setLibrary(previous => updateTitle(previous.map(m => m.id === meta.id && m.type === meta.type ? updated : m),updated)); } catch { if (controller.signal.aborted) return; } } }
    Promise.all(Array.from({length:Math.min(3,queue.length)},worker)).then(() => {if (live) setCalendarLoading(false);});
    return () => {live=false;controller.abort();};
    // Metadata writes do not restart synchronization; changes to membership do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[libraryKeys,addons,calendarRefresh,clockTick]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement) && !dialog.current?.open) { event.preventDefault(); document.querySelector<HTMLInputElement>('.search input')?.focus(); } }; document.addEventListener('keydown',onKey); return () => document.removeEventListener('keydown',onKey); },[]);
  useEffect(() => { if (!notice || noticeHeld) return; const timer = setTimeout(() => setNotice(undefined),4500); return () => clearTimeout(timer); },[notice,noticeHeld]);
  useEffect(() => {
    const controller = new AbortController(); let live = true; catalogRequest.current++; setLoading(true); setCatalogError('');
    // Rows stay on screen while the same view reloads (typing, filters, refresh); moving between browsing and search starts clean.
    const searching = Boolean(query.trim()); if (searching !== catalogSearching.current) { catalogSearching.current = searching; setCatalogs([]); }
    // Until the first new row lands, the rows on screen belong to the previous request and must not load further pages.
    const fresh: CatalogRow[] = []; staleRows.current = true; setCatalogsStale(true);
    const current = () => { if (staleRows.current) { staleRows.current = false; setCatalogsStale(false); } };
    const selection = catalogSelection(addons,query.trim(),filter);
    const order = (row:CatalogRow) => selection.findIndex(s => s.addon.url === row.addon.url && s.catalog.id === row.catalog.id && s.catalog.type === row.catalog.type);
    // Browsing keeps each shelf on screen until its catalog answers (home-cache.ts), so rows neither vanish nor jump.
    const keys = selection.map(({addon,catalog}) => `${addon.manifest.id}:${catalog.type}:${catalog.id}`); const answered = new Map<string,CatalogRow>(); const placed = new Set<string>(); let store: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => { const results = await Promise.allSettled(selection.map(async ({addon,catalog}) => {
      const row = await loadCatalog(addon,catalog,query.trim(),0,controller.signal);
      if (live) { fresh.push(row); current();
        if (searching) setCatalogs([...fresh].sort((a,b) => order(a)-order(b)));
        else { answered.set(row.key,row); const before = new Set(placed); placed.add(row.key); setCatalogs(previous => mergeRows(keys,answered,previous,before,false)); } }
    })); if (!live) return; current();
      // Nothing answered (offline, or the TV service still starting): keep last visit's rows rather than an empty home.
      if (!fresh.length) setCatalogs(previous => searching ? [] : previous.filter(cachedRow));
      else if (!searching) { const shown = new Set(placed); setCatalogs(previous => mergeRows(keys,answered,previous,shown,true));
        // Saved a moment later, so writing the copy never competes with the first frames of a fresh home.
        if (filter === 'All') store = setTimeout(() => storeHomeRows(keys.flatMap(key => answered.get(key) ?? [])),2000); } const reasons = results.flatMap(r => r.status === 'rejected' && r.reason instanceof Error ? [r.reason.message] : []); const failures = results.filter(r => r.status === 'rejected').length;
      // Hasimio Titles explains a first-time index build; say so and check again shortly instead of asking for a manual refresh.
      const building = reasons.find(reason => reason.startsWith('Building Hasimio’s title index'));
      if (building) { setCatalogError(building); retry = setTimeout(() => setRefresh(n => n+1),15000); }
      // One unreachable source is not worth a warning while others still show titles.
      else if (failures && failures === results.length) setCatalogError(`Catalogs could not load. ${[...new Set(reasons)].slice(0,2).join(' ')} Try refreshing.`.replace(/\s+/g,' '));
      setLoading(false); },250);
    let retry: ReturnType<typeof setTimeout> | undefined;
    return () => { live = false; controller.abort(); clearTimeout(timer); clearTimeout(retry); clearTimeout(store); };
  },[addons,query,filter,refresh]);
  useEffect(() => {
    if (selected) dialog.current?.showModal(); else dialog.current?.close();
  },[selected?.id]);
  useEffect(() => { if (!selected) return; const request = ++streamRequest.current; setStreams([]); setStreamError(''); setStreamLoading(true); const id = episode || selected.id; setStreamsFor(id);
    if (selected.type !== 'movie' && !episode) {setStreamLoading(false);return;}
    if (selected.id.startsWith('open:')) { setStreams(addons.some(a => a.builtin && a.enabled) ? demoStreams(selected.id) : []); setStreamLoading(false); return; }
    const sources = addons.filter(a => !a.builtin && supports(a,'stream',selected.type,id));
    // TV: sources found earlier (the next episode is looked up before it starts) apply at once.
    const cacheKey = streamCacheKey(selected.type,id,sources); const known = cachedStreams(cacheKey);
    if (known) { setStreams(known); setStreamLoading(false); return; }
    const controller=new AbortController();
    void searchStreams(sources,selected.type,id,controller.signal,state=>{
      if(request!==streamRequest.current)return;
      setStreams(state.streams);setStreamLoading(state.pending>0);
      if(state.pending===0&&!state.failed.length)storeStreams(cacheKey,state.streams);
      setStreamError(state.pending===0&&state.failed.length?`Couldn’t reach ${state.failed.join(', ')}. Retry to check again.`:'');
    });
    return()=>controller.abort();
    // Keyed by what is searched: when an anime's seasons merge, the title's ID can change while the episode
    // (and any playback already started from these sources) stays the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selected?.type,episode||selected?.id,addons,streamRefresh]);
  const videoId=episode||selected?.id||'';
  const automatic=!!selected&&!playing&&(quickPlay===videoId||!!queuedEpisode&&queuedEpisode===episode);
  // Play opens the start screen at once, while a source is still being chosen.
  const starting=automatic;
  const trackCacheRevision=useSyncExternalStore(subscribeTrackChanges,trackRevision);
  // TV: rank by live tracker counts, not the indexes' stale ones (webos/live-seeders.ts).
  const liveCounts=isWebOS||import.meta.env.VITE_ANDROID==='true'||engine.state==='ready';
  const liveSwarm=useLiveSeeders(streams,liveCounts&&!!selected);
  const rankedSources=useMemo(()=>rankSources(liveCounts?withLiveSeeders(streams,liveSwarm.counts):streams,preferences,videoId),[streams,preferences,videoId,trackCacheRevision,liveSwarm.counts]);
  const quickSource=rankedSources[0];
  // Capture the attempt in each callback. Late media events from a closed player
  // or a previous episode cannot start another source.
  const startup=useMemo<PlaybackStartup|undefined>(()=>{
    if(playback?.kind!=='automatic'&&playback?.kind!=='fallback')return;
    return {
      started:()=>setPlayback(current=>current===playback?{...current,kind:'started'}:current),
      failed:()=>setPlayback(current=>current===playback?recoverPlayback(current,rankedSources):current),
    };
  },[playback,rankedSources]);
  // Automatic source switches happen behind the start screen (PlaybackLoading), so they need no notice.

  const inspecting=useQuickTrackInspection(videoId,automatic&&engine.state==='ready'&&
    !!(preferences.audioLanguage||preferences.autoSubtitles),rankedSources.filter(usableSource));
  useEffect(()=>{
    if(!automatic)return;
    // Until the source search for this episode has begun, the list on screen is
    // the previous title's (or empty): starting from it could play the wrong
    // title, or give up with "No playable source".
    if(streamsFor!==videoId)return;
    const usable=!!quickSource&&usableSource(quickSource);
    if((usable||quickPlay&&quickSource)&&queuedSince.current?.id!==videoId)queuedSince.current={id:videoId,at:Date.now()};
    const waitedMs=queuedSince.current?Date.now()-queuedSince.current.at:0;
    const remaining=QUICK_PLAY_GRACE_MS-waitedMs;
    // Wait briefly for live seeder counts so Play does not start on a dead swarm.
    if(liveSwarm.pending&&waitedMs<6000){const timer=setTimeout(()=>setQueueTick(value=>value+1),300);return()=>clearTimeout(timer);}
    const decision=quickPlayDecision({loading:streamLoading&&!(quickPlay&&remaining<=0),found:!!quickSource,usable,waitedMs});
    const retryInMs=remaining>0&&inspecting?remaining:decision.action==='wait'?(decision.retryInMs??(quickPlay&&remaining>0?remaining:undefined)):undefined;
    if(retryInMs!==undefined){const timer=setTimeout(()=>setQueueTick(value=>value+1),retryInMs);return()=>clearTimeout(timer);}
    if(decision.action==='wait')return;
    setQueuedEpisode(undefined);setQuickPlay(undefined);queuedSince.current=undefined;
    if(decision.action==='play'&&quickSource)setPlayback({stream:quickSource,kind:'automatic'});
    else setNotice({text:'No playable source was found. Choose another source.'});
  },[automatic,videoId,streamsFor,quickPlay,quickSource,streamLoading,inspecting,queueTick,liveSwarm.pending]);

  // play: start the episode to resume at once (TV: Continue watching and the
  // spotlight's Resume), as on Netflix. Leaving that playback returns home.
  async function open(meta: Meta,videoId?:string,play=false) {
    const request=++detailRequest.current;provisionalEpisode.current=undefined;
    if(!dialog.current?.open)opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    detailAbort.current?.abort();
    const controller=new AbortController();detailAbort.current=controller;
    const cacheKey=JSON.stringify([meta.type,meta.id,addons.filter(a=>a.enabled).map(a=>[a.url,a.manifest.version])]);
    const savedMeta=library.find(m=>sameTitle(m,meta));
    const cached=detailCache.current.get(cacheKey);
    const initial=cached??(savedMeta&&(!needsMetadata(savedMeta)||(savedMeta.videos?.length??0)>(meta.videos?.length??0))?savedMeta:meta);
    const initialEpisode=(videoId&&initial.videos?.some(v=>v.id===videoId)?videoId:undefined)??nextEpisodeToWatch(initial,history)??defaultEpisode(initial)?.id;
    setSelected(initial);setEpisode(initialEpisode);setQueuedEpisode(undefined);setQuickPlay(undefined);setPlayback(undefined);setDialogScrolled(false);setSourcesOpen(false);
    playOnly.current=play;
    const known=initial.type==='movie'||!!initialEpisode;
    if(play&&known)setQuickPlay(initialEpisode??initial.id);
    if(dialog.current)dialog.current.scrollTop=0;
    const refreshNeeded=needsMetadata(initial)||initial.type!=='movie'&&!initial.videos?.length;
    setDetailLoading(refreshNeeded);
    if(imdbAnimeCandidate(initial)&&!keepImdbTitle(initial)&&addons.some(a=>a.enabled&&a.manifest.id===kitsu.manifest.id)){
      setDetailLoading(true);
      const anime=await findImdbAnime(initial,controller.signal).catch(()=>undefined);
      if(request!==detailRequest.current)return;
      if(anime)return open({...anime,imdbIds:[initial.id]},undefined,play);
      setDetailLoading(refreshNeeded);
    }
    if(!refreshNeeded)return;
    // An anime's opened season arrives before its other seasons. When no episode is chosen yet, its pick is
    // provisional: sources are searched at once, and the full list may still choose another (S1 E1, or where
    // you left off) unless you press Play or pick an episode first (confirmEpisode).
    const partial=(early:Meta)=>{
      if(request!==detailRequest.current)return;
      setSelected(early);
      const chosen=nextEpisodeToWatch(early,history)??defaultEpisode(early)?.id;
      setEpisode(current=>{if(current)return current;provisionalEpisode.current=chosen;return chosen;});
    };
    try{
      const updated=await loadMetadata(initial,addons,controller.signal,partial);
      if(request!==detailRequest.current)return;
      if(!updated.metadataError){
        detailCache.current.delete(cacheKey);detailCache.current.set(cacheKey,updated);
        if(detailCache.current.size>(isWebOS||isAndroidArm32?10:50))detailCache.current.delete(detailCache.current.keys().next().value!);
      }
      setSelected(updated);
      setEpisode(current=>current&&current!==provisionalEpisode.current&&updated.videos?.some(v=>v.id===current)?current:nextEpisodeToWatch(updated,history)??defaultEpisode(updated)?.id);
      // The episode to resume is known only now that the episode list arrived.
      if(play&&!known){const chosen=nextEpisodeToWatch(updated,history)??defaultEpisode(updated)?.id;if(chosen)setQuickPlay(chosen);}
      setLibrary(previous=>updateTitle(previous.map(m=>m.id===meta.id&&m.type===meta.type?updated:m),updated));
    }catch(error){if(!controller.signal.aborted)notify(error instanceof Error?error.message:'Could not load details. Try again.');}
    finally{if(request===detailRequest.current)setDetailLoading(false);}
  }
  function changeSearch(value:string) {setCollectionKey(undefined);if(page==='Progress'){setProgressQuery(value);return;}setQuery(value);if(page==='Library')return;if(value.trim()){setPage('Discover');if(!query.trim() || page !== 'Discover'){setFilter('All');setGenre('All genres');}}}
  // TV search keyboard: Back leaves it for the results, or the menu when nothing was typed.
  function closeKeyboard() {setTvKeyboard(false);requestAnimationFrame(()=>{const typed=page==='Progress'?progressQuery:query;(typed.trim()?document.querySelector<HTMLElement>('.page-content .poster-card')??document.querySelector<HTMLElement>('.page-content button'):document.querySelector<HTMLElement>('nav button.active'))?.focus();});}
  function closeDetail() { detailAbort.current?.abort();detailRequest.current++; streamRequest.current++; setSelected(undefined); setPlayback(undefined); setQueuedEpisode(undefined);setQuickPlay(undefined);playOnly.current=false;setStreamsFor('');
    // TV: return to the poster (or button) the title was opened from.
    if(isWebOS){const back=opener.current;opener.current=null;requestAnimationFrame(()=>{if(back?.isConnected&&!dialog.current?.open)back.focus({preventScroll:true});});} }
  // Leaving playback: back to the title page, or home when it was started with one press.
  function leavePlayback() { if(playOnly.current)closeDetail(); else setPlayback(undefined); }
  // A start that failed: show the title page with its sources open.
  function chooseOtherSource() { playOnly.current=false;setSourcesOpen(true);setPlayback(undefined); }
  // Pressing Play or picking an episode keeps it when the rest of an anime's seasons arrive.
  function confirmEpisode() {provisionalEpisode.current=undefined;}
  function chooseEpisode(id:string) {confirmEpisode();setQueuedEpisode(undefined);setQuickPlay(undefined);setEpisode(id);}
  function watchTarget(videoId?:string):WatchTarget|undefined {if(!selected)return;const video=videoId?selected.videos?.find(v=>v.id===videoId):undefined;return {key:progressKey(selected.type,videoId||selected.id),titleKey:progressKey(selected.type,selected.id),videoId:videoId||selected.id,episodeLabel:video?episodeLabel(selected,video):undefined};}
  function toggleWatched(videoId:string|undefined,watched:boolean) {const target=watchTarget(videoId);if(!target||!selected)return;const before={[target.key]:savedProgress(target.key)},label=videoId?target.episodeLabel:selected.name;setWatched([target],watched);notify(`${label} marked as ${watched?'watched':'unwatched'}`,()=>restoreProgress(before));}
  function markPreviousWatched(videoId?:string) {if(!selected)return;const targets=(videoId?episodesBefore(selected,videoId):(selected.videos??[]).filter(v=>v.episode!=null)).map(v=>({key:progressKey(selected.type,v.id),titleKey:progressKey(selected.type,selected.id),videoId:v.id,episodeLabel:episodeLabel(selected,v)})).filter(target=>!history[target.key]?.completed);if(!targets.length)return;const before=Object.fromEntries(targets.map(target=>[target.key,savedProgress(target.key)]));setWatched(targets);notify(`Marked ${targets.length} ${videoId?'earlier ':''}${targets.length===1?'episode':'episodes'} as watched`,()=>restoreProgress(before));}
  function markAllUnwatched() {if(!selected)return;const targets=(selected.videos??[]).filter(v=>v.episode!=null).map(v=>({key:progressKey(selected.type,v.id),titleKey:progressKey(selected.type,selected.id),videoId:v.id,episodeLabel:episodeLabel(selected,v)})).filter(target=>history[target.key]?.completed);if(!targets.length)return;const before=Object.fromEntries(targets.map(target=>[target.key,savedProgress(target.key)]));setWatched(targets,false);notify(`Marked ${targets.length} ${targets.length===1?'episode':'episodes'} as unwatched`,()=>restoreProgress(before));}
  function markSeasonWatched(season:number|undefined,watched:boolean) {if(!selected)return;const targets=(selected.videos??[]).filter(v=>v.episode!=null&&v.season===season).map(v=>({key:progressKey(selected.type,v.id),titleKey:progressKey(selected.type,selected.id),videoId:v.id,episodeLabel:episodeLabel(selected,v)})).filter(target=>watched?!history[target.key]?.completed:history[target.key]?.completed);if(!targets.length)return;const before=Object.fromEntries(targets.map(target=>[target.key,savedProgress(target.key)]));setWatched(targets,watched);const label=season==null?'Episodes':season===0?'Specials':selected.videos?.find(v=>v.season===season)?.seasonName??'Season '+season;notify(label+' marked as '+(watched?'watched':'unwatched'),()=>restoreProgress(before));}
  function startPlayback(stream:Stream) {confirmEpisode();setQueuedEpisode(undefined);setQuickPlay(undefined);setPlayback({stream,kind:'manual'});}
  function playEpisode(id:string) {if(!selected||id===episode)return;confirmEpisode();queuedSince.current=undefined;setQuickPlay(undefined);streamRequest.current++;setQueuedEpisode(id);setPlayback(undefined);setStreams([]);setStreamError('');setStreamLoading(true);setEpisode(id);}
  function toggleSave(meta:Meta) { const index = library.findIndex(m => sameTitle(m,meta)); if (index < 0) { setLibrary(previous => [...previous,meta]); notify(`${meta.name} added to your library`); return; }
    const removed = library[index]; setLibrary(previous => previous.filter(m => !sameTitle(m,meta))); notify(`${meta.name} removed from your library`,() => setLibrary(previous => previous.some(m => m.id === removed.id && m.type === removed.type) ? previous : [...previous.slice(0,index),removed,...previous.slice(index)])); }
  function removeAddon(addon:Addon) { const index = addons.findIndex(a => a.manifest.id === addon.manifest.id); setAddons(previous => previous.filter(a => a.manifest.id !== addon.manifest.id)); notify(`${addon.manifest.name} removed`,() => setAddons(previous => previous.some(a => a.manifest.id === addon.manifest.id) ? previous : [...previous.slice(0,index),addon,...previous.slice(index)])); }
  async function install(input = installUrl) { setInstalling(true); setInstallError(''); try { const url = manifestUrl(input); const manifest = validateManifest(await getJson(url)); if (addons.some(a => a.manifest.id === manifest.id)) throw new Error('This extension is already installed.'); setAddons(previous => [...previous,{url,manifest,enabled:true}]); setInstallUrl(''); notify(`${manifest.name} installed`); } catch (e) { setInstallError(e instanceof Error ? e.message : 'Installation failed. Check the URL and CORS support.'); } finally { setInstalling(false); } }
  function exportFile() { const blob = new Blob([JSON.stringify(exportLibrary(library,addons),null,2)],{type:'application/json'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `hasimio-library-${new Date().toLocaleDateString('sv-SE')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000); notify(`Exported ${library.length} saved title${library.length === 1 ? '' : 's'}`); }
  async function importFile(file?: File) { if (!file) return; try { if (file.size > 10*1024*1024) throw new Error('Choose a Hasimio library export smaller than 10 MB.'); const merged = mergeLibrary({library,addons},parseLibrary(await file.text())); setLibrary(previous => mergeLibrary({library:previous,addons:[]},{library:merged.library,addons:[]}).library); setAddons(previous => mergeLibrary({library:[],addons:previous},{library:[],addons:merged.addons}).addons); notify(`Imported ${merged.added.titles} title${merged.added.titles === 1 ? '' : 's'} and ${merged.added.addons} extension${merged.added.addons === 1 ? '' : 's'}`); } catch (e) { notify(e instanceof Error ? e.message : 'Could not import this library.'); } }
  function refreshCalendar() {setCalendarRefresh(Date.now());}
  // A page for rows that have since been replaced is dropped as "nothing new", not as a failed load.
  async function more(row:CatalogRow) {if(staleRows.current||cachedRow(row))return [];const request=catalogRequest.current,pending=request+':'+row.key;if(morePending.current.has(pending))return undefined;morePending.current.add(pending); try {const next = await loadCatalog(row.addon,row.catalog,query.trim(),row.skip); if (request !== catalogRequest.current) return []; setCatalogs(previous => previous.map(c => c.key !== row.key ? c : {...next,items:isWebOS?next.items.slice(0,30):isAndroidArm32?next.items:[...new Map([...c.items,...next.items].map(m => [`${m.type}:${m.id}`,m])).values()],hasMore:next.hasMore && next.items.some(m => !c.items.some(old => old.id === m.id && old.type === m.type))}));return next.items.filter(m=>!row.items.some(old=>old.id===m.id&&old.type===m.type));} catch {return request === catalogRequest.current ? undefined : [];} finally {morePending.current.delete(pending);}}
  // IMDb numbers anime differently, so a saved or started IMDb entry stays as it is rather than losing that progress.
  const startedTitles=useMemo(()=>new Set(Object.entries(history).map(([key,entry])=>entry.titleKey??key)),[history]);
  const keepImdbTitle=(meta:Meta)=>startedTitles.has(progressKey(meta.type,meta.id))||library.some(m=>m.id===meta.id&&m.type===meta.type);
  const knownAnime=useMemo(()=>[...progressMetadata,...library,...catalogs.flatMap(c=>c.items)].filter(m=>m.category==='anime'&&m.seriesKeys),[progressMetadata,library,catalogs]);
  const shelfTitles=(items:Meta[])=>groupAnimeSeries(mergeImdbAnime(items,knownAnime,keepImdbTitle));
  const filtered = (items:Meta[]) => shelfTitles(items).filter(m => `${m.type}:${m.id}` !== spotlightKey).filter(m => (filter === 'All' || (filter === 'Anime' ? mediaLabel(m) === 'Anime' : m.type === (filter === 'Movies' ? 'movie' : 'series'))) && (genre === 'All genres' || m.genres?.includes(genre)));
  const saved = (meta:Meta) => library.some(m => sameTitle(m,meta));
  const allGenres = [...new Set([...demo,...catalogs.flatMap(c => c.items),...library].flatMap(m => m.genres ?? []))].sort();
  useEffect(()=>storeProgressTitles(progressMetadata),[progressMetadata]);
  const knownTitles = useMemo(() => {const known=[...progressMetadata,...library,...catalogs.flatMap(c => c.items),...demo,...openFilms];return [...known,...progressTitleSeeds(history,known)];},[progressMetadata,catalogs,library,history]);
  useEffect(()=>{if(selected?.videos?.length&&!selected.metadataPartial)setProgressMetadata(previous=>[...previous.filter(meta=>!sameTitle(meta,selected)),selected]);},[selected]);
  const cardMetadata=useMemo(()=>{const result=new Map<string,Meta>();for(const meta of [...knownTitles,...(selected?[selected]:[])])for(const id of new Set([meta.id,...(meta.seasonIds??[])])){const key=progressKey(meta.type,id),previous=result.get(key);if(!previous||(meta.videos?.length??0)>(previous.videos?.length??0))result.set(key,meta);}return result;},[knownTitles,selected]);
  const cardProgress=(meta:Meta)=>titleProgress(cardMetadata.get(progressKey(meta.type,meta.id))??meta,history);
  const libraryItems = useMemo(() => {
    const matchesStatus = (m:Meta) => {
      if (libraryStatus === 'all') return true;
      const p = cardProgress(m);
      const finished = p?.status === 'Watched' || p?.status === 'Caught up';
      if (libraryStatus === 'finished') return finished;
      if (libraryStatus === 'watching') return !!p && !finished;
      return !p;
    };
    const items = [...library].reverse()
      .filter(m => !query.trim() || m.name.toLowerCase().includes(query.trim().toLowerCase()))
      .filter(matchesStatus);
    if (librarySort === 'name') items.sort((a,b) => a.name.localeCompare(b.name));
    else if (librarySort === 'year') items.sort((a,b) => (parseInt(b.releaseInfo ?? '0') || 0) - (parseInt(a.releaseInfo ?? '0') || 0) || a.name.localeCompare(b.name));
    else if (librarySort === 'watched') items.sort((a,b) => (cardProgress(b)?.updatedAt ?? 0) - (cardProgress(a)?.updatedAt ?? 0));
    return items;
  },[library,query,libraryStatus,librarySort,cardMetadata,history]);
  const localRows = page === 'Library' ? [{title:'Your collection',items:libraryItems}] : [...(!loading && !catalogs.length && filter !== 'Anime' ? [{title:'Starter picks · Offline selection',items:demo.filter(m => !query.trim() || m.name.toLowerCase().includes(query.trim().toLowerCase()))}] : []),...(addons.some(a => a.builtin && a.enabled) && !query.trim() ? [{title:'Open Cinema · Ready to play',items:openFilms}] : [])];
  const progressLookupKey=JSON.stringify([...new Set(Object.entries(history).map(([key,p])=>p.titleKey??key))].sort());
  const progressKnownKey=JSON.stringify([...new Set(knownTitles.map(meta=>progressKey(meta.type,meta.id)))].sort());
  useEffect(()=>{
    const controller=new AbortController();let live=true;
    const force=progressRefreshApplied.current!==progressRefresh;progressRefreshApplied.current=progressRefresh;
    const tracked=new Set<string>(JSON.parse(progressLookupKey));
    const known=new Map<string,Meta>();
    for(const meta of knownTitles){const key=progressKey(meta.type,meta.id),previous=known.get(key);if(!previous||(meta.videos?.length??0)>(previous.videos?.length??0))known.set(key,meta);}
    const needsRuntime=(key:string,meta:Meta)=>Object.entries(history).some(([entryKey,p])=>
      (p.titleKey??entryKey)===key&&p.completed&&p.manual&&p.duration<=1&&
      !runtimeSeconds(meta.runtime)&&!runtimeSeconds(meta.videos?.find(video=>video.id===p.videoId||progressKey(meta.type,video.id)===entryKey)?.runtime));
    const queue=[...known].filter(([key,meta])=>tracked.has(key)&&(force||(page==='Progress'&&needsRuntime(key,meta))||(meta.type!=='movie'&&!meta.videos?.length)||needsMetadata(meta))).map(([,meta])=>meta);
    setProgressLoading(queue.length>0);
    async function worker(){while(queue.length&&live){const meta=queue.shift()!;try{
      const updated=await loadMetadata(meta,addons,controller.signal);
      if(live)setProgressMetadata(previous=>[...previous.filter(item=>!sameTitle(item,updated)),updated]);
    }catch{if(controller.signal.aborted)return;}}}
    void Promise.all(Array.from({length:Math.min(3,queue.length)},worker)).then(()=>{if(live)setProgressLoading(false);});
    return()=>{live=false;controller.abort();};
    // Metadata writes do not restart this batch; identity changes and explicit retries do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[page,addons,progressLookupKey,progressKnownKey,progressRefresh]);
  const continueItems = useMemo(() => continueWatching(history,knownTitles),[history,knownTitles]);
  const continueRow = query.trim() ? [] : [{title:'Continue watching',key:'continue',items:page === 'Library' ? continueItems.filter(saved) : continueItems}].filter(row => row.items.length);
  const newThisWeekRow = useMemo(() => {
    if (query.trim() || page !== 'Discover') return [];
    const now = Date.now(), weekAgo = now - 7 * 86400 * 1000;
    const recent = library
      .map(meta => ({meta:cardMetadata.get(progressKey(meta.type,meta.id))??meta, latest:Math.max(0,...datedVideos(cardMetadata.get(progressKey(meta.type,meta.id))??meta).map(v => Date.parse(v.released!)).filter(t => t >= weekAgo && t <= now))}))
      .filter(entry => entry.latest > 0 && !continueItems.some(c => sameTitle(c,entry.meta)))
      .sort((a,b) => b.latest - a.latest)
      .map(entry => entry.meta);
    return recent.length ? [{title:'New this week',key:'new-this-week',source:'In your library',items:recent}] : [];
  },[query,page,library,cardMetadata,continueItems]);
  const topRow = query.trim() && page !== 'Library' ? [{title:'Top results',key:'top',source:'Best matches',items:topResults(catalogs,query)}].filter(row => row.items.length > 1) : [];
  // Top 10: the first page of the popular movies catalog, ranked as it comes. Hasimio Titles ranks
  // recent movies by the votes they gained since its previous weekly index (title-index.mjs).
  const popularMovies = page === 'Discover' && !query.trim() && filter === 'All' && genre === 'All genres' ? popularRow(catalogs,'movie') : undefined;
  const topTenItems = popularMovies ? shelfTitles(popularMovies.items).filter(m => m.type === 'movie').slice(0,10) : [];
  const topTenRow = topTenItems.length === 10 ? [{title:'Top 10 movies',key:'top-10',items:topTenItems}] : [];
  // The popular movies shelf would otherwise open with the same ten posters; it continues after them.
  const topTenKeys = new Set(topTenRow.length ? topTenItems.map(m => m.type+':'+m.id) : []);
  const allRows:{title:string;items:Meta[];key?:string;source?:string;hasMore?:boolean}[] = page === 'Library' ? [...continueRow,...localRows] : [...continueRow,...newThisWeekRow,...topTenRow,...topRow,...catalogs,...localRows];
  const collectionRow=page==='Discover'?allRows.find(row=>(row.key||row.title)===collectionKey):undefined;
  const rows=collectionRow?[collectionRow]:allRows;
  // The billboard features a popular title with wide artwork (featured.ts); the starter pick only covers offline use.
  // Search results and filtered catalogs are not candidates, so the pick survives a search.
  const featuredRows = useMemo(() => !query.trim() && filter === 'All' ? catalogs : [],[catalogs,query,filter]);
  const featuredChoice = useFeatured(useMemo(() => featuredCandidates(featuredRows),[featuredRows]));
  const chosenFeature = featuredChoice.featured ?? (featuredChoice.settled && !loading ? demo.find(m => safeHttp(m.background)) ?? demo[0] : undefined);
  // Catalog entries carry no description; the title's details supply one.
  const [featuredDetails,setFeaturedDetails] = useState<Meta>();
  const chosenFeatureKey = chosenFeature ? `${chosenFeature.type}:${chosenFeature.id}` : '';
  useEffect(() => {
    if (!chosenFeature || chosenFeature.description) return;
    const controller = new AbortController();
    loadMetadata(chosenFeature,addons,controller.signal).then(details => {if (!details.metadataError) setFeaturedDetails(details);}).catch(() => {});
    return () => controller.abort();
    // Loaded once per featured title; later catalog refreshes of the same title need no new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[chosenFeatureKey]);
  const featured = useMemo(() => chosenFeature && featuredDetails && featuredDetails.id === chosenFeature.id && featuredDetails.type === chosenFeature.type
    ? {...chosenFeature,description:chosenFeature.description ?? featuredDetails.description,runtime:chosenFeature.runtime ?? featuredDetails.runtime,imdbRating:chosenFeature.imdbRating ?? featuredDetails.imdbRating,genres:chosenFeature.genres?.length ? chosenFeature.genres : featuredDetails.genres}
    : chosenFeature,[chosenFeature,featuredDetails]);
  const showHero = page === 'Discover' && !collectionRow && !query && filter === 'All' && !tvKeyboard;
  // Off the TV the billboard spans the window, under a top bar that stays clear until you scroll.
  const billboard = showHero && !isWebOS && (!!featured || loading || !featuredChoice.settled);
  const [scrolled,setScrolled] = useState(false);
  useEffect(() => {const update = () => setScrolled(window.scrollY > SOLID_TOPBAR_AT);update();window.addEventListener('scroll',update,{passive:true});return () => window.removeEventListener('scroll',update);},[]);
  const episodeStill = (meta:Meta) => {const progress = cardProgress(meta);return progress?.videoId ? (cardMetadata.get(progressKey(meta.type,meta.id)) ?? meta).videos?.find(v => v.id === progress.videoId)?.thumbnail : undefined;};
  const heroElement = featured ? <Hero featured={featured} progressOf={cardProgress} label={mediaLabel} saved={saved} onPlay={meta => void open(meta,undefined,true)} onInfo={meta => void open(meta)} onToggleSave={toggleSave}/> : <section className={`hero hero-placeholder${isWebOS ? '' : ' billboard'}`} aria-hidden="true"/>;
  // The spotlight title is not repeated in the shelves right below it.
  const activeRow=rows.find(row=>(row.key||row.title)===browseRow);
  const browseItems=activeRow?filteredForBrowse(activeRow.items):[];
  function filteredForBrowse(items:Meta[]){return shelfTitles(items).filter(m=>(filter==='All'||(filter==='Anime'?mediaLabel(m)==='Anime':m.type===(filter==='Movies'?'movie':'series')))&&(genre==='All genres'||m.genres?.includes(genre)));}
  const browseIndex=selected?browseItems.findIndex(m=>sameTitle(m,selected)):-1;
  async function browseTitle(direction:number){
    if(browsing)return;
    const target=browseItems[browseIndex+direction];
    if(target){void open(target);return;}
    if(direction>0&&activeRow?.hasMore){
      const catalog=catalogs.find(row=>row.key===activeRow.key);if(!catalog)return;
      setBrowsing(true);const request=detailRequest.current;
      try{const added=await more(catalog);const next=added&&filteredForBrowse([...activeRow.items,...added]).find(m=>!browseItems.some(old=>sameTitle(old,m)||(old.seriesKeys??[]).some(key=>m.seriesKeys?.includes(key))));if(request===detailRequest.current&&dialog.current?.open){if(next)void open(next);else if(!added)notify('Could not load the next titles. Try again.');}}finally{setBrowsing(false);}
    }
  }
  const spotlightKey = page === 'Discover' && !query && filter === 'All' && featured ? `${featured.type}:${featured.id}` : '';

  useEffect(()=>{
    if(!isWebOS||!selected||playing)return;
    const frame=requestAnimationFrame(()=>{
      dialog.current?.querySelector<HTMLButtonElement>('.detail-actions .primary,.queued-episode .button')?.focus({preventScroll:true});
    });
    return()=>cancelAnimationFrame(frame);
  },[selected?.id,selected?.type,Boolean(playing),Boolean(queuedEpisode),automatic]);
  // Opening the sources moves into the list, as any opened menu does on the TV.
  // While sources are still loading, focus stays on the button.
  useEffect(()=>{
    if(!isWebOS||!sourcesOpen||playing)return;
    const frame=requestAnimationFrame(()=>{const list=dialog.current?.querySelector<HTMLDetailsElement>('.stream-picker details');if(list)list.open=true;const first=list?.querySelector<HTMLElement>('summary');if(first){first.focus({preventScroll:true});first.scrollIntoView({block:'start'});}});
    return()=>cancelAnimationFrame(frame);
  },[sourcesOpen,Boolean(playing)]);
  const currentProgress = selected && history[progressKey(selected.type,episode || selected.id)];
  const currentVideo = selected?.videos?.find(v => v.id === episode);
  // The title's wide artwork, once known to load (Metahub has none for some titles).
  const selectedBackdrops = selected ? backdropSources(selected) : [];
  const detailBackdrop = useImage(selectedBackdrops);
  // The start screen shows the title's wide artwork, or its poster when it has none.
  const startArtwork = selected ? detailBackdrop.src ?? posterSources(selected)[0] : undefined;
  const {previous:prior,next:upcoming}=useMemo(()=>adjacentEpisodes(selected,episode),[selected,episode]);
  const previousEpisode=selected&&prior?{label:episodeLabel(selected,prior),onPlay:()=>playEpisode(prior.id)}:undefined;
  const prefetched=useRef('');
  const prefetchEpisode=useCallback(()=>{
    if(!selected||!upcoming||prefetched.current===upcoming.id)return;
    const id=upcoming.id,type=selected.type;prefetched.current=id;
    const sources=addons.filter(a=>!a.builtin&&supports(a,'stream',type,id));
    const key=streamCacheKey(type,id,sources);
    const known=cachedStreams(key);if(known){void prefetchLiveSeeders(known);return;}
    const controller=new AbortController();setTimeout(()=>controller.abort(),SOURCE_TIMEOUT_MS+5000);
    void searchStreams(sources,type,id,controller.signal,state=>{
      if(state.pending>0)return;
      if(!state.failed.length)storeStreams(key,state.streams);
      void prefetchLiveSeeders(state.streams);
    });
  },[selected,upcoming,addons]);
  const nextUp = selected && upcoming ? {label:episodeLabel(selected,upcoming),title:upcoming.title || upcoming.name,thumbnail:upcoming.thumbnail || detailBackdrop.src,onPlay:()=>playEpisode(upcoming.id)} : undefined;
  // A modal dialog sits in the top layer, so the toast must render inside it while details are open.
  const toast = notice && <div className="toast" role="status" onMouseEnter={() => setNoticeHeld(true)} onMouseLeave={() => setNoticeHeld(false)} onFocus={() => setNoticeHeld(true)} onBlur={() => setNoticeHeld(false)}><Check size={17}/>{notice.text}{notice.undo && <button className="toast-action" onClick={() => {notice.undo?.();setNotice(undefined);setNoticeHeld(false);}}>Undo</button>}</div>;
  // Play can be pressed before any source has answered; the start screen covers the wait.
  const playEarly = streamLoading && !quickSource;
  // A series is searched per episode: until one is chosen, say why there are no sources yet.
  const episodeWait:EpisodeWait|undefined = selected && selected.type !== 'movie' && !episode ? detailLoading ? 'loading' : selected.metadataError ? 'failed' : 'none' : undefined;
  // Reloads only the details, keeping the TV's source panel open; a load already running is left alone.
  const reloadDetails = () => { if (!selected || detailLoading) return; const keep = sourcesOpen; void open(selected); setSourcesOpen(keep); };
  const playLabel =`${currentProgress && !currentProgress.completed && currentProgress.position > 0 ? 'Resume' : 'Play'}${selected && currentVideo ? ` ${episodeLabel(selected,currentVideo)}` : ''}`;
  const navigate = (name:string) => {setPage(name);setCollectionKey(undefined);setQuery('');setProgressQuery('');setFilter('All');setGenre('All genres');};
  return <div className={`app-shell${topNavigation ? ' top-nav-layout' : ''}${billboard ? ' has-billboard' : ''}`}><DesktopTitleBar/>
    <MobileNavigation page={page} onNavigate={navigate}/>
    {!topNavigation && <aside className="sidebar"><a className="brand" href="#" onClick={e => {e.preventDefault();setPage('Discover');}}><span className="brand-symbol"><Play size={21} fill="currentColor"/></span>hasimio<span className="brand-dot">.</span></a><nav aria-label="Main">{[{name:'Discover',icon:Compass},{name:'Live TV',icon:Tv,short:'Live'},{name:'Library',icon:Library},{name:'Progress',icon:BarChart3,short:'Stats'},{name:'Calendar',icon:CalendarDays},{name:'Extensions',icon:Puzzle,short:'Add-ons'},{name:'Sync devices',icon:MonitorSmartphone,short:'Sync'},{name:'Settings',icon:SettingsIcon}].map(({name,icon:Icon,short}) => <button key={name} aria-label={name} className={`nav-item ${(page === name||page==='Actor'&&name==='Discover') ? 'active' : ''}`} onClick={() => { setPage(name); setCollectionKey(undefined); setQuery(''); setProgressQuery(''); setFilter('All'); setGenre('All genres'); }}><Icon size={20}/><span data-short={short}>{name}</span>{name === 'Library' && library.length > 0 && <small>{library.length}</small>}</button>)}</nav><div className="sidebar-bottom"><button className="profile-switch" aria-label="Switch profile" onClick={()=>{deviceSync.capture();requestProfilePicker();location.reload();}}><span className={"profile-avatar profile-color-"+(currentProfile()?.color??0)} aria-hidden="true">{currentProfile()?.name.slice(0,1).toUpperCase()}</span><span className="profile-switch-label">{currentProfile()?.name??"My profile"}<small>Switch profile</small></span></button><button className={`sync-status ${sync.state}`} onClick={() => setPage('Sync devices')}><i aria-hidden="true"/>{syncLabel}</button><div className="version">HASIMIO <span>v{appVersion}</span></div></div></aside>}
    <main><header className={`topbar${billboard && !scrolled ? ' over-art' : ''}`}><a className="topbar-brand" href="#" aria-label="Hasimio home" onClick={e => {e.preventDefault();navigate('Discover');window.scrollTo({top:0,behavior:'instant'});}}><span className="brand-symbol"><Play size={19} fill="currentColor"/></span>{topNavigation && <span className="brand-name" aria-hidden="true">hasimio</span>}</a>{topNavigation && <TopNavigation page={page} onNavigate={navigate}/>}<label className="search"><Search size={17}/><input aria-label={page==='Progress'?'Search within Progress':page==='Library'?'Search your library':'Search titles or actors'} placeholder={page==='Progress'?'Search within Progress…':page==='Library'?'Search your library…':'Search titles or actors…'} value={page==='Progress'?progressQuery:query} onChange={e => changeSearch(e.target.value)}/>{(page==='Progress'?progressQuery:query) && <button onClick={() => page==='Progress'?setProgressQuery(''):setQuery('')} aria-label="Clear search"><X size={15}/></button>}<kbd>/</kbd></label>{topNavigation && <ProfileMenu page={page} onNavigate={navigate} syncLabel={syncLabel} syncState={sync.state} version={appVersion}/>}</header>
    {billboard && heroElement}
    <div className={`page-content${billboard ? ' after-billboard' : ''}`}>
      <UpdateBanner state={update}/>
      {isWebOS && tvKeyboard && searchPage && <SearchKeyboard value={page==='Progress'?progressQuery:query} onChange={changeSearch} onDone={closeKeyboard}/>}
      {isWebOS && showHero && (featured || loading) && heroElement}
      {(page === 'Discover' || page === 'Library') && <>{(query || page === 'Library') && <div className="section-intro"><h1>{page === 'Library' ? 'Library' : `Results for “${query}”`}</h1>{page === 'Library' && <div className="library-actions"><span className="count-label">{library.length} saved title{library.length === 1 ? '' : 's'}</span><button className="button secondary" onClick={exportFile} disabled={!library.length}><Download size={16}/> Export</button><button className="button secondary" onClick={() => importInput.current?.click()}><Upload size={16}/> Import</button><input ref={importInput} type="file" accept=".json,application/json" hidden aria-label="Import library file" onChange={e => {void importFile(e.target.files?.[0]);e.currentTarget.value='';}}/></div>}</div>}<div className="filter-bar"><div className="segmented">{['All','Movies','Series','Anime'].map(item => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="filters"><select aria-label="Filter by genre" value={genre} onChange={e => setGenre(e.target.value)}><option>All genres</option>{allGenres.map(g => <option key={g}>{g}</option>)}</select>{page === 'Library' ? <><select aria-label="Filter by watch status" value={libraryStatus} onChange={e => setLibraryStatus(e.target.value as typeof libraryStatus)}><option value="all">All status</option><option value="watching">Watching</option><option value="unstarted">Not started</option><option value="finished">Finished</option></select><select aria-label="Sort library" value={librarySort} onChange={e => setLibrarySort(e.target.value as typeof librarySort)}><option value="added">Recently added</option><option value="watched">Last watched</option><option value="name">Title A–Z</option><option value="year">Release year</option></select></> : <button className="icon-button" onClick={() => setRefresh(n => n+1)} aria-label="Refresh catalogs"><RefreshCw size={16} className={loading ? 'spin' : ''}/></button>}{topNavigation && <CardSizeControl value={cardSize}/>}</div></div>
      {!addons.some(a => a.manifest.id === titles.manifest.id) && page === 'Discover' && <div className="source-banner"><span className="small-puzzle"><Puzzle size={18}/></span><p><strong>Make room for more.</strong> Add Hasimio Titles for live movie and series catalogs. Featured picks below are a starter selection.</p><button onClick={() => setAddons(previous => replaceCinemeta(previous))}>Add catalog<ArrowUpRight size={15}/></button></div>}{installError && page === 'Discover' && <p className="error" role="alert">{installError}</p>}{catalogError && page === 'Discover' && <p className="error" role="alert">{catalogError}</p>}
      {loading && page === 'Discover' && <div className="loading" role="status"><LoaderCircle className="spin" size={17}/> {query.trim() ? 'Searching titles…' : 'Loading catalogs…'}</div>}
      {page==='Discover'&&query.trim()&&<ActorSearch query={query.trim()} onSelect={openActor}/>}
      {rows.map(row => {
        // Top 10 keeps its ranking: the billboard's title stays in it.
        const ranked = row.key === 'top-10', afterTopTen = row === popularMovies && !collectionRow;
        const items = ranked ? row.items : filtered(row.items).filter(m => !afterTopTen || !topTenKeys.has(m.type+':'+m.id));
        if (!items.length) return null;
        const wrap = !!(collectionRow || (page === 'Library' && row.key !== 'continue') || query), wide = row.key === 'continue' && !wrap;
        const choose = (meta:Meta) => {setBrowseRow(row.key||row.title);void open(meta,undefined,row.key==='continue');};
        return <MediaShelf key={row.key || row.title} title={row.title} source={row.source===titles.manifest.name?undefined:row.source} expanded={!!collectionRow} variant={wide?'wide':ranked?'ranked':undefined} onBrowse={page==='Discover'&&!collectionRow&&!ranked?()=>{collectionScroll.current=window.scrollY;setCollectionKey(row.key||row.title);window.scrollTo({top:0,behavior:'instant'});}:undefined} onBack={collectionRow?()=>{setCollectionKey(undefined);requestAnimationFrame(()=>window.scrollTo({top:collectionScroll.current,behavior:'instant'}));}:undefined} wrap={wrap} hasMore={row.hasMore&&!catalogsStale} onMore={async()=>{const catalog=catalogs.find(c=>c.key===row.key);return catalog?!!await more(catalog):false;}}>
          {items.map((meta,index) => wide
            ? <WideCard key={meta.type+':'+meta.id} meta={meta} progress={cardProgress(meta)} still={episodeStill(meta)} onClick={() => choose(meta)}/>
            : <Poster key={meta.type+':'+meta.id} rank={ranked ? index+1 : undefined} progress={cardProgress(meta)} meta={meta} saved={saved(meta)} onClick={() => choose(meta)}/>)}
        </MediaShelf>;
      })}
      {!loading && !rows.some(row => filtered(row.items).length) && <div className="empty-state"><Library size={38}/><h3>{page === 'Library' && !library.length ? 'Your next obsession belongs here' : catalogError ? 'Search could not finish' : 'No titles found'}</h3><p>{page === 'Library' && !library.length ? 'Save a movie or series from Discover to start your collection.' : catalogError ? 'The catalog is unavailable. Retry to search again.' : 'Try another title, genre, or media type.'}</p><button className="button primary" onClick={() => {if(catalogError){setRefresh(n=>n+1);return;}setPage('Discover');setQuery('');setFilter('All');setGenre('All genres');}}>{catalogError ? 'Retry search' : 'Explore titles'}</button></div>}</>}
      {page==='Actor'&&actor&&<ActorTitles person={actor} saved={saved} onOpen={open} onBack={()=>setPage('Discover')}/>}
      <React.Suspense fallback={<div className="loading" role="status"><LoaderCircle className="spin" size={17}/> Loading…</div>}>
      {page === 'Live TV' && <LiveTV/>}
      {page === 'Settings' && <Settings/>}
      {page === 'Sync devices' && <SyncDevices/>}
      {page === 'Progress' && <Progress onImported={(items,message)=>{setProgressMetadata(previous=>[...previous,...items.filter(item=>!previous.some(meta=>meta.id===item.id&&meta.type===item.type))]);notify(message);}} searchQuery={progressQuery} onSearchChange={setProgressQuery} loading={progressLoading} onRefresh={()=>setProgressRefresh(value=>value+1)} history={history} titles={knownTitles} onOpen={open} onDiscover={() => setPage('Discover')}/>}
      {page === 'Calendar' && <Calendar library={library} syncing={calendarLoading} onRefresh={refreshCalendar} onOpen={open} onDiscover={() => setPage('Discover')}/>}
      </React.Suspense>
      {page === 'Extensions' && <><div className="section-intro"><h1>Extensions</h1><span className="count-label">{addons.filter(a => a.enabled).length} of {addons.length} active</span></div><UpdatePanel state={update}/>{isWebOS&&<TVStoragePanel/>}<EnginePanel engine={engine}/>{[['Catalogs & metadata',addons.filter(a=>a.manifest.resources.some(r=>(typeof r==='string'?r:r.name)==='catalog'||(typeof r==='string'?r:r.name)==='meta'))] as const,['Playback sources',addons.filter(a=>!a.manifest.resources.some(r=>(typeof r==='string'?r:r.name)==='catalog'||(typeof r==='string'?r:r.name)==='meta'))] as const].filter(([,items])=>items.length).map(([groupTitle,items])=><section className="extension-group" key={groupTitle}><h2 className="extension-group-heading">{groupTitle}</h2><div className="extension-list">{items.map(addon => {const logo=safeHttp(addon.manifest.logo);return <article className="extension-item" key={addon.manifest.id}><div className={`extension-logo ${addon.builtin ? 'orange' : ''}`}>{logo?<img src={logo} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/>:addon.builtin ? <Film size={25}/> : <Puzzle size={25}/>}</div><div className="extension-info"><h3>{addon.manifest.name}<span>v{addon.manifest.version}</span></h3><p>{addon.manifest.description}</p><div className="resource-tags">{addon.manifest.resources.map(r => typeof r === 'string' ? r : r.name).map(r => <span key={r}>{r==='catalog'?'Catalogs':r==='meta'?'Details':r==='stream'?'Streams':r==='subtitles'?'Subtitles':r}</span>)}</div></div><div className="extension-controls"><button role="switch" aria-checked={addon.enabled} aria-label={`Enable ${addon.manifest.name}`} className={`switch ${addon.enabled ? 'on' : ''}`} onClick={() => setAddons(previous => previous.map(a => a.manifest.id === addon.manifest.id ? {...a,enabled:!a.enabled} : a))}><span/></button>{!addon.builtin && <button className="icon-button" aria-label={`Remove ${addon.manifest.name}`} onClick={() => removeAddon(addon)}><Trash2 size={17}/></button>}</div></article>;})}</div></section>)}<section className="install-panel"><div className="extension-intro-icon"><Puzzle size={28}/></div><div><h3>Add an extension</h3><p>Paste a Stremio-compatible manifest URL. Only install sources you trust: they receive your catalog and playback requests.</p><form className="install-form" onSubmit={e => {e.preventDefault();install();}}><input type="url" required aria-label="Extension manifest URL" placeholder="https://your-extension.com/manifest.json" value={installUrl} onChange={e => setInstallUrl(e.target.value)}/><button className="button primary" disabled={installing}>{installing ? <LoaderCircle className="spin" size={17}/> : <Plus size={17}/>} Install extension</button></form>{installError && <p className="error" role="alert">{installError} The source must allow browser requests (CORS).</p>}</div></section>{!addons.some(a => a.manifest.id === titles.manifest.id) && <section className="recommended-extension"><div><h3>Hasimio Titles</h3><p>Hasimio’s own movie and series catalogs, built locally from IMDb’s public datasets, with Wikipedia movie posters and TVmaze series artwork and air dates.</p><a href="https://developer.imdb.com/non-commercial-datasets/" target="_blank" rel="noreferrer">About the IMDb datasets <ExternalLink size={13}/></a></div><button className="button secondary" onClick={() => setAddons(previous => replaceCinemeta(previous))}><Plus size={17}/> Add Hasimio Titles</button></section>}<p className="extension-footnote">Extensions connect to external services. Availability, content, and stream quality are managed by each provider. The Pirate Bay, YTS, EZTV, TorrentDownloads, TorrentClaw, and Torrentio use Hasimio’s local torrent service. Playback depends on available peers and browser codec support; closing the player stops the torrent and clears temporary data.</p></>}
    </div></main>
    <dialog aria-label={selected?.name || 'Media details'} ref={dialog} onCancel={closeDetail} onClick={e => {if (e.target === e.currentTarget) closeDetail();}} onScroll={e => {const past = e.currentTarget.scrollTop > 160; if (past !== dialogScrolled) setDialogScrolled(past);}} className={`detail-dialog ${playing||queuedEpisode||starting?'playback-dialog':''} ${dialogScrolled && !playing && !queuedEpisode ? 'scrolled' : ''}`}>{selected && <>{!playing && !queuedEpisode && !starting && <div className="dialog-bar"><strong aria-hidden="true">{selected.name}</strong>{browseIndex>=0&&<div className="detail-browse" aria-label="Browse titles"><button className="icon-button" aria-label="Previous title" disabled={browsing||browseIndex===0} onClick={()=>void browseTitle(-1)}><ChevronLeft size={20}/></button><button className="icon-button" aria-label="Next title" disabled={browsing||browseIndex===browseItems.length-1&&!activeRow?.hasMore} onClick={()=>void browseTitle(1)}>{browsing?<LoaderCircle size={18} className="spin"/>:<ChevronRight size={20}/>}</button></div>}<button className="icon-button close-dialog" onClick={closeDetail} aria-label="Close details"><X/></button></div>}{playing ? playing.infoHash||playsThroughEngine(playing) ? <TorrentPlayer episodeLabel={selected.videos?.find(v=>v.id===episode)?episodeLabel(selected,selected.videos.find(v=>v.id===episode)!):undefined} startup={startup} key={JSON.stringify([progressKey(selected.type,episode||selected.id),playbackSourceKey(playing)])} progressKey={progressKey(selected.type,episode||selected.id)} titleKey={progressKey(selected.type,selected.id)} title={selected.name} stream={playing} videoId={episode || selected.id} previous={previousEpisode} next={nextUp} backdrop={startArtwork} description={selected.description} onClose={leavePlayback} onSources={chooseOtherSource} onNearEnd={prefetchEpisode}/> : <Player backdrop={startArtwork} description={selected.description} episodeLabel={selected.videos?.find(v=>v.id===episode)?episodeLabel(selected,selected.videos.find(v=>v.id===episode)!):undefined} startup={startup} key={JSON.stringify([progressKey(selected.type,episode||selected.id),playbackSourceKey(playing)])} progressKey={progressKey(selected.type,episode||selected.id)} titleKey={progressKey(selected.type,selected.id)} videoId={episode||selected.id} title={selected.name} stream={playing} previous={previousEpisode} next={nextUp} onClose={leavePlayback} onSources={chooseOtherSource} onNearEnd={prefetchEpisode}/> : starting ? <PlaybackLoading progressKey={videoId} title={selected.name} detail={currentVideo ? episodeLabel(selected,currentVideo) : undefined} backdrop={startArtwork} cap={30} message="Finding the best source…" onChoose={()=>{playOnly.current=false;setQuickPlay(undefined);setQueuedEpisode(undefined);queuedSince.current=undefined;setSourcesOpen(true);}} onCancel={() => {if(playOnly.current){closeDetail();return;}setQuickPlay(undefined);setQueuedEpisode(undefined);queuedSince.current=undefined;}}/> : queuedEpisode ? <div className="torrent-buffering queued-episode"><div className="player-bar"><strong>{selected.name}</strong><button className="icon-button" onClick={() => setQueuedEpisode(undefined)} aria-label="Cancel and show sources"><X/></button></div><div className="buffering-body" role="status"><LoaderCircle className="spin" size={40}/><h2>Finding {currentVideo ? episodeLabel(selected,currentVideo) : 'the episode'}</h2><p>Checking your sources. Playback starts as soon as a good one answers.</p><button className="button secondary" onClick={() => setQueuedEpisode(undefined)}>Choose a source yourself</button></div></div> : <><div className={`detail-art ${detailBackdrop.src || !detailBackdrop.settled && selectedBackdrops.length ? '' : 'empty'}`} style={detailBackdrop.src ? {backgroundImage:`linear-gradient(0deg,#181818,transparent),url("${detailBackdrop.src}")`} : undefined}/><div className="detail-content"><div className={`detail-heading ${posterSources(selected).length ? '' : 'no-poster'}`}>{posterSources(selected).length > 0 && <div className="detail-poster"><PosterImage meta={selected} loading="eager"/></div>}<div className="detail-title"><h2>{selected.name}</h2><p>{[selected.releaseInfo,selected.runtime,mediaLabel(selected),selected.imdbRating && `★ ${selected.imdbRating}`].filter(Boolean).join(' · ')}</p></div><div className="detail-actions"><button className="button primary" disabled={(!quickSource&&!playEarly||automatic)&&!isWebOS} aria-disabled={(!quickSource&&!playEarly)||automatic} onClick={()=>{if((quickSource||playEarly)&&!automatic){confirmEpisode();queuedSince.current=undefined;setQuickPlay(videoId);}}}>{episodeWait==='loading'||(automatic||streamLoading && !quickSource)&&!playEarly ? <LoaderCircle className="spin" size={17}/> : <Play size={17} fill="currentColor"/>} {episodeWait==='loading' ? 'Loading episodes…' : episodeWait==='failed' ? 'Episodes unavailable' : episodeWait==='none' ? 'No episodes yet' : (automatic||streamLoading && !quickSource)&&!playEarly ? 'Finding sources…' : quickSource||playEarly ? playLabel : 'No playable source'}</button>{isWebOS&&<button className="button secondary" aria-expanded={sourcesOpen} onClick={()=>setSourcesOpen(open=>!open)}><ListVideo size={18}/> {sourcesOpen?'Hide sources':'Other sources'}</button>}<button className="button secondary" onClick={() => toggleSave(selected)}>{saved(selected) ? <Check size={18}/> : <Plus size={18}/>} {saved(selected) ? 'Saved' : 'Save'}</button>{selected.type === 'movie' && <button className={`button secondary ${currentProgress?.completed ? 'is-saved' : ''}`} aria-pressed={!!currentProgress?.completed} onClick={() => toggleWatched(undefined,!currentProgress?.completed)}>{currentProgress?.completed ? <Check size={18}/> : <CircleCheck size={18}/>} {currentProgress?.completed ? 'Watched' : 'Mark as watched'}</button>}</div></div><Description text={selected.description || 'Install a metadata extension to load the full description and episode information.'}/><div className="resource-tags">{selected.genres?.map(g => <span key={g}>{g}</span>)}</div><TitleCast meta={selected} onSelect={openActor}/>{detailLoading && <p className="loading"><LoaderCircle className="spin" size={16}/> Loading details…</p>}{selected.type !== 'movie' && <EpisodeList meta={selected} episode={episode} history={history} onSelect={chooseEpisode} onToggleWatched={toggleWatched} onMarkPrevious={markPreviousWatched} onMarkAll={()=>markPreviousWatched()} onMarkAllUnwatched={markAllUnwatched} onMarkSeason={markSeasonWatched}/>}{(!isWebOS||sourcesOpen)&&<StreamPicker videoId={episode || selected.id} key={`${selected.type}:${episode || selected.id}`} streams={streams} loading={streamLoading} error={streamError} automatic={automatic} episodes={episodeWait} onPlay={startPlayback} onRetry={episodeWait ? reloadDetails : retryStreams} onManage={() => {closeDetail();setPage("Extensions");}}/>}</div></>}</>}{selected && toast}</dialog>
    {!selected && toast}
    {hoverCards && <HoverPreview progressOf={cardProgress} saved={saved} onPlay={meta => void open(meta,undefined,true)} onInfo={meta => void open(meta)} onToggleSave={toggleSave}/>}
  </div>;
}


