import {useEffect,useMemo,useState,type CSSProperties} from 'react';
import {BarChart3,Check,ChevronLeft,ChevronRight,Film,Flame,LoaderCircle,Play,RefreshCw,Search,X} from 'lucide-react';
import {type Meta} from './media';
import TVTimeImport from './TVTimeImport';
import PosterImage,{ArtImage} from './PosterImage';
import {backdropSources,posterSources} from './poster-artwork';
import {type ProgressMap} from './playback-progress';
import {activityCalendar,activityFacts,progressSummary,type ActivityCell,type MediaProgress,type ProgressSummary,type UpNext} from './progress-summary';
import {formatWatchTime} from './watch-time';
import './progress.css';

const number=(value:number)=>value.toLocaleString();
const plural=(count:number,one:string,many:string)=>`${number(count)} ${count===1?one:many}`;
const isAnime=(item:MediaProgress)=>item.meta.category==='anime'||item.meta.type==='anime'||item.meta.id.startsWith('kitsu:');
function when(value:number){
  const date=new Date(value),today=new Date();
  if(date.toDateString()===today.toDateString())return 'Today';
  const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
  if(date.toDateString()===yesterday.toDateString())return 'Yesterday';
  return date.toLocaleDateString(undefined,{month:'short',day:'numeric',...(date.getFullYear()!==today.getFullYear()?{year:'numeric'}:{})});
}
/** A weekday date, with the year only when it is not this year. */
const longDate=(time:number)=>{
  const date=new Date(time);
  return date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',...(date.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})});
};

/** An element (attach with the returned ref) and its width, kept current as the layout changes. */
function useWidth<T extends HTMLElement>(){
  const [element,setElement]=useState<T|null>(null),[width,setWidth]=useState(0);
  useEffect(()=>{
    if(!element)return;
    const measure=()=>setWidth(element.getBoundingClientRect().width);
    measure();const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[element]);
  return {ref:setElement,element,width};
}
/** Poster grids fill whole rows: the number of columns the grid's CSS gives at its current width. */
function useColumns(fallback:number){
  const {ref,element,width}=useWidth<HTMLDivElement>();
  const [columns,setColumns]=useState(fallback);
  useEffect(()=>{
    if(!element||!width)return;
    const count=getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length;
    if(count)setColumns(count);
  },[element,width]);
  return {ref,columns};
}

/** The poster, over a plain card with the title for titles without artwork. */
function Artwork({meta,named=false}:{meta:Meta;named?:boolean}){
  return <span className="progress-artwork"><span className="progress-artwork-fallback" aria-hidden="true"><Film size={22}/>{named&&<b>{meta.name}</b>}</span><PosterImage meta={meta}/></span>;
}
/** Time watched with its units set smaller than the numbers: 5d 17h 35m. */
function Duration({seconds}:{seconds:number}){
  const text=formatWatchTime(seconds),parts=[...text.matchAll(/(\d+)([a-z]+)/g)];
  return parts.length?<>{parts.map(([,value,unit],index)=><span key={unit}>{index?' ':''}{value}<small>{unit}</small></span>)}</>:<>{text}</>;
}

function Hero({summary,stats}:{summary:ProgressSummary;stats:{label:string;value:string}[]}){
  const last=summary.recent[0];
  return <section className="progress-hero" aria-label="Your totals">
    {last&&<div className="progress-hero-art" aria-hidden="true"><ArtImage sources={[...backdropSources(last.meta),...posterSources(last.meta)]} loading="eager"/></div>}
    <div className="progress-hero-content">
      <article className="progress-stat progress-stat-lead"><span>Time watched</span><strong><Duration seconds={summary.watchTime}/></strong></article>
      <div className="progress-stats">{stats.map(stat=><article className="progress-stat" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong></article>)}</div>
    </div>
    {last&&<p className="progress-hero-caption"><span>Last watched</span> {last.meta.name}{last.meta.type!=='movie'&&last.label?` · ${last.label}`:''}</p>}
  </section>;
}

function UpNextCard({item,revealed,onOpen}:{item:UpNext;revealed:boolean;onOpen:(meta:Meta)=>void}){
  const status=item.resume!==undefined?<><b>Resume {item.label}</b> · {item.resume}% watched</>:item.airs?<><b>{item.label}</b> · airs {longDate(item.airs)}</>:<><b>{item.fresh?'New':'Next'}: {item.label}</b>{item.video.title&&!/^Episode #?[\d.]+$/i.test(item.video.title)?` · ${item.video.title}`:''}</>;
  return <button type="button" className={'progress-upnext-card'+(item.airs?' is-upcoming':'')+(revealed?' is-revealed':'')} onClick={()=>onOpen(item.meta)}>
    <span className="progress-upnext-art" aria-hidden="true"><Film size={28}/><ArtImage sources={[...backdropSources(item.meta),...posterSources(item.meta)]}/></span>
    <span className="progress-upnext-play" aria-hidden="true"><Play size={18} fill="currentColor"/></span>
    <span className="progress-upnext-text">
      <strong>{item.meta.name}</strong>
      <small>{status}</small>
      <span className="progress-upnext-meter"><span className="progress-upnext-track" role="progressbar" aria-label={item.meta.name+' watched'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.percent}><span style={{width:item.percent+'%'}}/></span><span>{item.watched} of {item.total}</span></span>
    </span>
  </button>;
}

/** One row of cards, as many as fit, with the rest behind Show all. */
function UpNextSection({items,onOpen}:{items:UpNext[];onOpen:(meta:Meta)=>void}){
  const {ref,width}=useWidth<HTMLElement>();
  const perRow=!width?4:width>=2200?6:width>=1700?5:width>1150?4:width>860?3:2;
  // One card short of a full row widens the cards instead of leaving a hole at the end.
  const columns=items.length<perRow?Math.max(items.length,perRow-1):perRow;
  const [all,setAll]=useState(false);
  return <section className="progress-upnext" aria-label="Up next" ref={ref}>
    <div className="progress-section-heading"><h2>Up next <span>{items.length}</span></h2>{items.length>perRow&&<button type="button" className="progress-more" aria-expanded={all} onClick={()=>setAll(!all)}>{all?'Show less':`Show all ${items.length}`}</button>}</div>
    <div className="progress-upnext-grid" style={{'--upnext-cols':columns} as CSSProperties}>{(all?items:items.slice(0,perRow)).map((item,index)=><UpNextCard key={item.meta.type+':'+item.meta.id} item={item} revealed={index>=perRow} onOpen={onOpen}/>)}</div>
  </section>;
}

function Heatmap({summary}:{summary:ProgressSummary}){
  const {ref,element:frame,width}=useWidth<HTMLDivElement>();
  // A year when it fits with readable squares; half a year on narrow screens.
  const weeks=width&&width<620?26:53;
  const calendar=useMemo(()=>activityCalendar(summary.activity,Date.now(),weeks),[summary.activity,weeks]);
  const [tip,setTip]=useState<{cell:ActivityCell;left:number;top:number}>();
  const cells=calendar.columns.flat();
  const span=weeks===53?'the last year':'the last six months';
  return <div className="progress-heatmap" ref={ref} style={{'--weeks':weeks} as CSSProperties}
    onMouseLeave={()=>setTip(undefined)}
    onMouseOver={event=>{
      const target=(event.target as HTMLElement).closest<HTMLElement>('[data-cell]');
      const cell=target?cells[Number(target.dataset.cell)]:undefined;
      if(!target||!cell||!frame){setTip(undefined);return;}
      const box=target.getBoundingClientRect(),outer=frame.getBoundingClientRect();
      // Kept within the panel at either end of the year.
      setTip({cell,left:Math.min(Math.max(box.left-outer.left+box.width/2,80),outer.width-80),top:box.top-outer.top});
    }}>
    <div className="progress-heatmap-months" aria-hidden="true">{calendar.months.map(month=><span key={month.column} style={{gridColumn:month.column+1}}>{month.label}</span>)}</div>
    <div className="progress-heatmap-body">
      <div className="progress-heatmap-days" aria-hidden="true"><span/><span>Mon</span><span/><span>Wed</span><span/><span>Fri</span><span/></div>
      <div className="progress-heatmap-grid" role="img" aria-label={`${plural(calendar.total,'title','titles')} watched on ${plural(calendar.activeDays,'day','days')} in ${span}`}>
        {cells.map((cell,index)=>cell?<span key={cell.date} data-cell={index} className={'is-level-'+cell.level}/>:<span key={'empty'+index} className="is-future"/>)}
      </div>
    </div>
    {tip&&<span className="progress-heatmap-tip" role="presentation" style={{left:tip.left,top:tip.top}}><b>{tip.cell.count?`${number(tip.cell.count)} watched · ${formatWatchTime(tip.cell.seconds)}`:'Nothing watched'}</b>{longDate(tip.cell.time)}</span>}
  </div>;
}

function Activity({summary}:{summary:ProgressSummary}){
  const facts=useMemo(()=>activityFacts(summary.activity),[summary.activity]);
  const genres=summary.genres.slice(0,5),top=genres[0]?.seconds??0;
  return <div className={'progress-insights'+(genres.length?'':' is-single')}>
    <section className="progress-panel progress-activity-panel" aria-label="Activity">
      <div className="progress-panel-heading"><h2>Activity</h2><span className="progress-legend" aria-hidden="true">Less<i className="is-level-0"/><i className="is-level-1"/><i className="is-level-2"/><i className="is-level-3"/><i className="is-level-4"/>More</span></div>
      <Heatmap summary={summary}/>
      <dl className="progress-facts">
        <div><dt>Last 7 days</dt><dd>{plural(facts.weekCount,'title','titles')}<small>{facts.weekSeconds?formatWatchTime(facts.weekSeconds):'Nothing yet'}</small></dd></div>
        <div><dt>Current streak</dt><dd>{facts.currentStreak>1&&<Flame size={18} aria-hidden="true"/>}{plural(facts.currentStreak,'day','days')}</dd></div>
        <div><dt>Longest streak</dt><dd>{plural(facts.longestStreak,'day','days')}</dd></div>
      </dl>
    </section>
    {genres.length>0&&<section className="progress-panel progress-genres" aria-label="Top genres">
      <div className="progress-panel-heading"><h2>Top genres</h2><span>By time watched</span></div>
      <ol>{genres.map(item=><li key={item.genre}><span>{item.genre}</span><span className="progress-genre-bar" aria-hidden="true"><span style={{width:Math.max(4,Math.round(item.seconds/top*100))+'%'}}/></span><span>{formatWatchTime(item.seconds)}</span></li>)}</ol>
    </section>}
  </div>;
}

function SeriesCard({item,onOpen}:{item:MediaProgress;onOpen:(meta:Meta)=>void}){
  const known=item.total>0;
  return <button type="button" className={'progress-row'+(item.finished?' is-finished':'')} onClick={()=>onOpen(item.meta)}>
    <span className="progress-poster">
      <Artwork meta={item.meta} named/>
      {item.finished&&<span className="progress-row-state is-finished"><Check size={13} strokeWidth={3}/>Finished</span>}
      {known&&<span className="progress-row-track" role="progressbar" aria-label={item.meta.name+' watched'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.percent}><span style={{width:item.percent+'%'}}/></span>}
    </span>
    <span className="progress-row-text">
      <strong>{item.meta.name}</strong>
      <small>{known?`${number(item.watched)} of ${number(item.total)} episodes`:plural(item.watched,'episode','episodes')+' watched'}{known&&!item.finished&&<span className="progress-row-state">{item.percent}%</span>}</small>
      {!known&&<span className="progress-unknown">Episode total unavailable</span>}
    </span>
  </button>;
}
function MovieCard({item,onOpen}:{item:MediaProgress;onOpen:(meta:Meta)=>void}){
  const watched=when(item.lastUpdated);
  return <button type="button" className="progress-movie" onClick={()=>onOpen(item.meta)}>
    <span className="progress-poster"><Artwork meta={item.meta} named/></span>
    <span className="progress-row-text"><strong>{item.meta.name}</strong><small>Watched {/^[A-Z][a-z]+day$/.test(watched)?watched.toLowerCase():watched}</small></span>
  </button>;
}
function Pagination({label,total,size,page,onPage}:{label:string;total:number;size:number;page:number;onPage:(page:number)=>void}){
  if(total<=size)return null;
  const pages=Math.ceil(total/size);
  return <nav className="progress-pagination" aria-label={`${label} pages`}>
    <span role="status">{number(page*size+1)}–{number(Math.min((page+1)*size,total))} of {number(total)} {label.toLowerCase()}</span>
    <div><button type="button" disabled={page===0} onClick={()=>onPage(page-1)} aria-label={`Previous ${label.toLowerCase()} page`}><ChevronLeft size={16}/></button><span>{page+1} / {pages}</span><button type="button" disabled={page+1>=pages} onClick={()=>onPage(page+1)} aria-label={`Next ${label.toLowerCase()} page`}><ChevronRight size={16}/></button></div>
  </nav>;
}

export default function Progress({history,titles,onOpen,onDiscover,loading=false,onRefresh,searchQuery,onSearchChange,onImported}:{history:ProgressMap;titles:Meta[];onImported:(titles:Meta[],message:string)=>void;onOpen:(meta:Meta)=>void;onDiscover:()=>void;loading?:boolean;onRefresh?:()=>void;searchQuery?:string;onSearchChange?:(value:string)=>void}){
  const summary=useMemo(()=>progressSummary(history,titles),[history,titles]);
  const [filter,setFilter]=useState('All'),[sort,setSort]=useState('recent');
  const [category,setCategory]=useState('TV Series');
  const [localQuery,setQuery]=useState(''),[seriesPage,setSeriesPage]=useState(0),[moviePage,setMoviePage]=useState(0);
  // Two full rows of posters per page, however many fit across.
  const seriesGrid=useColumns(6),movieGrid=useColumns(6);
  const seriesSize=seriesGrid.columns*2,movieSize=movieGrid.columns*2;
  const query=searchQuery??localQuery;
  useEffect(()=>{setSeriesPage(0);setMoviePage(0);},[searchQuery]);
  const search=query.trim().toLocaleLowerCase();
  const matches=(item:MediaProgress)=>item.meta.name.toLocaleLowerCase().includes(search);
  const changeQuery=(value:string)=>{if(onSearchChange)onSearchChange(value);else setQuery(value);setSeriesPage(0);setMoviePage(0);};
  const empty=!summary.seriesStarted&&!summary.moviesWatched&&!summary.recent.length;
  const unknown=summary.series.filter(item=>!item.total).length;
  const tracked=summary.seriesStarted+summary.moviesWatched;
  const categorySeries=summary.series.filter(item=>category==='Anime'?isAnime(item):!isAnime(item));
  const shown=categorySeries.filter(item=>matches(item)&&(filter==='All'||(filter==='Finished'?item.finished:!item.finished))).sort((a,b)=>sort==='name'?a.meta.name.localeCompare(b.meta.name):sort==='completion'?b.percent-a.percent:b.lastUpdated-a.lastUpdated);
  const movies=summary.movies.filter(matches);
  const currentSeriesPage=Math.min(seriesPage,Math.max(0,Math.ceil(shown.length/seriesSize)-1));
  const currentMoviePage=Math.min(moviePage,Math.max(0,Math.ceil(movies.length/movieSize)-1));
  const stats=[
    {label:'Episodes watched',value:number(summary.episodesWatched)},
    {label:'Movies watched',value:number(summary.moviesWatched)},
    {label:'Series started',value:number(summary.seriesStarted)},
    {label:'Series finished',value:number(summary.seriesCompleted)},
    {label:'Episodes left',value:number(summary.episodesRemaining)},
  ];
  return <section className="progress-page">
    <div className="progress-header">
      <div className="section-intro"><h1>Progress</h1>{!empty&&<span className="count-label">{plural(tracked,'title','titles')} tracked</span>}</div>
      <TVTimeImport onImported={onImported}/>
    </div>
    {empty?<div className="empty-state"><BarChart3 size={38}/><h3>Your watch history starts here</h3><p>Play something or mark episodes and movies as watched to start tracking.</p><button className="button primary" onClick={onDiscover}><Play size={17} fill="currentColor"/> Find something to watch</button></div>:<>
      <Hero summary={summary} stats={stats}/>
      {searchQuery===undefined&&<div className="progress-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Search tracked titles" placeholder="Search your tracked titles" value={query} onChange={event=>changeQuery(event.target.value)}/>{query&&<button type="button" aria-label="Clear title search" onClick={()=>changeQuery('')}><X size={17}/></button>}</div>}
      {/* Searching shows matching titles straight away; the overview returns with an empty search. */}
      {!search&&summary.upNext.length>0&&<UpNextSection items={summary.upNext} onOpen={onOpen}/>}
      {!search&&<Activity summary={summary}/>}
      <div className="progress-body">
        <div className="progress-main">
          {summary.series.length>0&&<section className="progress-section" aria-label="Series progress">
            <div className="progress-section-heading"><h2>{category} <span>{categorySeries.length}</span></h2>{onRefresh&&<button className="progress-refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh episode totals">{loading?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}<span>{loading?'Updating…':'Refresh totals'}</span></button>}</div>
            <div className="progress-toolbar">
              <div className="progress-categories" role="group" aria-label="Series category">{['TV Series','Anime'].map(value=><button type="button" key={value} aria-pressed={category===value} onClick={()=>{setCategory(value);setSeriesPage(0);}}>{value}<span>{summary.series.filter(item=>value==='Anime'?isAnime(item):!isAnime(item)).length}</span></button>)}</div>
              <div className="progress-filters" role="group" aria-label="Filter series">{['All','Watching','Finished'].map(value=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setSeriesPage(0);}}>{value}<span>{value==='All'?categorySeries.length:value==='Finished'?categorySeries.filter(item=>item.finished).length:categorySeries.filter(item=>!item.finished).length}</span></button>)}</div>
              <label className="progress-sort"><span className="sr-only">Sort series</span><select aria-label="Sort series" value={sort} onChange={event=>{setSort(event.target.value);setSeriesPage(0);}}><option value="recent">Recent activity</option><option value="name">Title A–Z</option><option value="completion">Most complete</option></select></label>
            </div>
            {shown.length?<><div className="progress-list" ref={seriesGrid.ref}>{shown.slice(currentSeriesPage*seriesSize,(currentSeriesPage+1)*seriesSize).map(item=><SeriesCard key={item.meta.type+':'+item.meta.id} item={item} onOpen={onOpen}/>)}</div><Pagination label="Series" total={shown.length} size={seriesSize} page={currentSeriesPage} onPage={setSeriesPage}/></>:<div className="progress-filter-empty">{search?<Search size={22}/>:<Check size={22}/>}<h3>{search?'No matching series':!categorySeries.length?(category==='Anime'?'No tracked anime yet':'No tracked TV series yet'):filter==='Finished'?'No finished series yet':'All caught up'}</h3><p>{search?'Try another title or change the series filter.':!categorySeries.length?'Watch or mark episodes to start tracking this category.':filter==='Finished'?'Series appear here when every listed episode is watched.':'Your tracked series are in the Finished tab.'}</p><button onClick={()=>{setFilter('All');changeQuery('');}}>Show all series</button></div>}
            {unknown>0&&<p className="progress-note" role="status">{loading?'Loading missing episode totals…':unknown+' '+(unknown===1?'series is':'series are')+' missing episode totals. Completion and episodes left include known totals only.'}</p>}
          </section>}
          {summary.movies.length>0&&<section className="progress-section" aria-label="Movies watched"><div className="progress-section-heading"><h2>Movies watched <span>{summary.movies.length}</span></h2></div>{movies.length?<><div className="progress-movies" ref={movieGrid.ref}>{movies.slice(currentMoviePage*movieSize,(currentMoviePage+1)*movieSize).map(item=><MovieCard key={item.meta.type+':'+item.meta.id} item={item} onOpen={onOpen}/>)}</div><Pagination label="Movies" total={movies.length} size={movieSize} page={currentMoviePage} onPage={setMoviePage}/></>:<p className="progress-note" role="status">No movies match your search.</p>}</section>}
        </div>
        <details className="progress-activity">
          <summary>Recent activity <ChevronRight size={17} aria-hidden="true"/></summary>
          <div className="progress-recent">{summary.recent.map((item,index)=><button className="progress-recent-row" key={item.meta.type+':'+item.meta.id+':'+index} onClick={()=>onOpen(item.meta)}><span className="progress-recent-poster"><Artwork meta={item.meta}/><span className={'progress-recent-mark'+(item.completed?' is-complete':'')} aria-hidden="true">{item.completed?<Check size={12} strokeWidth={3}/>:<Play size={11} fill="currentColor"/>}</span></span><span className="progress-recent-text"><strong>{item.meta.name}</strong><small>{item.label}{!item.completed?' · '+item.percent+'%':''}</small><time dateTime={new Date(item.updatedAt).toISOString()}>{when(item.updatedAt)}</time></span></button>)}</div>
          <p className="progress-note">Watched titles include their full runtime, including manual marks. Unfinished titles use saved playback progress. A series’ usual episode length is used when an individual runtime is unavailable.</p>
        </details>
        {summary.runtimeMissing>0&&<p className="progress-note" role="status">{summary.runtimeMissing} watched {summary.runtimeMissing===1?'item has':'items have'} no runtime available yet and {summary.runtimeMissing===1?'is':'are'} excluded from time watched.</p>}
      </div>
    </>}
  </section>;
}
