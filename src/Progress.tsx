import {useMemo,useState} from 'react';
import {BarChart3,Check,ChevronLeft,ChevronRight,Film,LoaderCircle,Play,RefreshCw,Search,X} from 'lucide-react';
import {type Meta} from './media';
import PosterImage from './PosterImage';
import {type ProgressMap} from './playback-progress';
import {progressSummary,type MediaProgress} from './progress-summary';
import {formatWatchTime} from './watch-time';
import './progress.css';

const number=(value:number)=>value.toLocaleString();
const isAnime=(item:MediaProgress)=>item.meta.category==='anime'||item.meta.type==='anime'||item.meta.id.startsWith('kitsu:');
function when(value:number){
  const date=new Date(value),today=new Date();
  if(date.toDateString()===today.toDateString())return 'Today';
  const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
  if(date.toDateString()===yesterday.toDateString())return 'Yesterday';
  return date.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function Artwork({meta}:{meta:Meta}){
  return <span className="progress-artwork"><Film size={20} aria-hidden="true"/><PosterImage meta={meta}/></span>;
}
function TitleRow({item,onOpen}:{item:MediaProgress;onOpen:(meta:Meta)=>void}){
  const known=item.total>0;
  return <button type="button" className="progress-row" onClick={()=>onOpen(item.meta)}>
    <Artwork meta={item.meta}/>
    <span className="progress-row-text">
      <strong>{item.meta.name}</strong>
      <small>{known?number(item.watched)+' of '+number(item.total)+' episodes watched':number(item.watched)+' episodes watched'}</small>
      {known?<span className="progress-row-track" role="progressbar" aria-label={item.meta.name+' watched'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.percent}><span style={{width:item.percent+'%'}}/></span>:<span className="progress-unknown">Episode total unavailable</span>}
    </span>
    <span className={'progress-row-state'+(item.finished?' is-finished':'')}>{item.finished?<><Check size={14}/>Finished</>:known?item.percent+'%':'Tracked'}</span>
    <ChevronRight size={16} className="progress-row-chevron" aria-hidden="true"/>
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
export default function Progress({history,titles,onOpen,onDiscover,loading=false,onRefresh}:{history:ProgressMap;titles:Meta[];onOpen:(meta:Meta)=>void;onDiscover:()=>void;loading?:boolean;onRefresh?:()=>void}){
  const summary=useMemo(()=>progressSummary(history,titles),[history,titles]);
  const [filter,setFilter]=useState('All'),[sort,setSort]=useState('recent');
  const [category,setCategory]=useState('TV Series');
  const [query,setQuery]=useState(''),[seriesPage,setSeriesPage]=useState(0),[moviePage,setMoviePage]=useState(0);
  const search=query.trim().toLocaleLowerCase();
  const matches=(item:MediaProgress)=>item.meta.name.toLocaleLowerCase().includes(search);
  const changeQuery=(value:string)=>{setQuery(value);setSeriesPage(0);setMoviePage(0);};
  const empty=!summary.seriesStarted&&!summary.moviesWatched&&!summary.recent.length;
  const unknown=summary.series.filter(item=>!item.total).length;
  const tracked=summary.seriesStarted+summary.moviesWatched;
  const categorySeries=summary.series.filter(item=>category==='Anime'?isAnime(item):!isAnime(item));
  const shown=categorySeries.filter(item=>matches(item)&&(filter==='All'||(filter==='Finished'?item.finished:!item.finished))).sort((a,b)=>sort==='name'?a.meta.name.localeCompare(b.meta.name):sort==='completion'?b.percent-a.percent:b.lastUpdated-a.lastUpdated);
  const movies=summary.movies.filter(matches);
  const seriesSize=8,movieSize=6;
  const currentSeriesPage=Math.min(seriesPage,Math.max(0,Math.ceil(shown.length/seriesSize)-1));
  const currentMoviePage=Math.min(moviePage,Math.max(0,Math.ceil(movies.length/movieSize)-1));
  const stats=[
    {label:'Episodes watched',value:number(summary.episodesWatched)},
    {label:'Movies watched',value:number(summary.moviesWatched)},
    {label:'Series started',value:number(summary.seriesStarted)},
    {label:'Series finished',value:number(summary.seriesCompleted)},
    {label:'Episodes left',value:number(summary.episodesRemaining)},
    {label:'Time watched',value:formatWatchTime(summary.watchTime)},
  ];
  return <section className="progress-page">
    <div className="section-intro"><h1>Progress</h1>{!empty&&<span className="count-label">{number(tracked)} {tracked===1?'title':'titles'} tracked</span>}</div>
    {empty?<div className="empty-state"><BarChart3 size={38}/><h3>Your watch history starts here</h3><p>Play something or mark episodes and movies as watched to start tracking.</p><button className="button primary" onClick={onDiscover}><Play size={17} fill="currentColor"/> Find something to watch</button></div>:<>
      <div className="progress-stats">{stats.map(stat=><article className="progress-stat" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong></article>)}</div>
      <div className="progress-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Search tracked titles" placeholder="Search your tracked titles" value={query} onChange={event=>changeQuery(event.target.value)}/>{query&&<button type="button" aria-label="Clear title search" onClick={()=>changeQuery('')}><X size={17}/></button>}</div>
      <div className="progress-body">
        <div className="progress-main">
          {summary.series.length>0&&<section className="progress-section" aria-label="Series progress">
            <div className="progress-section-heading"><h2>{category} <span>{categorySeries.length}</span></h2>{onRefresh&&<button className="progress-refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh episode totals">{loading?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}<span>{loading?'Updating…':'Refresh totals'}</span></button>}</div>
            <div className="progress-categories" role="group" aria-label="Series category">{['TV Series','Anime'].map(value=><button type="button" key={value} aria-pressed={category===value} onClick={()=>{setCategory(value);setSeriesPage(0);}}>{value}<span>{summary.series.filter(item=>value==='Anime'?isAnime(item):!isAnime(item)).length}</span></button>)}</div>
            <div className="progress-toolbar"><div className="progress-filters" role="group" aria-label="Filter series">{['All','Watching','Finished'].map(value=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setSeriesPage(0);}}>{value}<span>{value==='All'?categorySeries.length:value==='Finished'?categorySeries.filter(item=>item.finished).length:categorySeries.filter(item=>!item.finished).length}</span></button>)}</div><label className="progress-sort"><span className="sr-only">Sort series</span><select aria-label="Sort series" value={sort} onChange={event=>{setSort(event.target.value);setSeriesPage(0);}}><option value="recent">Recent activity</option><option value="name">Title A–Z</option><option value="completion">Most complete</option></select></label></div>
            {shown.length?<><div className="progress-list">{shown.slice(currentSeriesPage*seriesSize,(currentSeriesPage+1)*seriesSize).map(item=><TitleRow key={item.meta.type+':'+item.meta.id} item={item} onOpen={onOpen}/>)}</div><Pagination label="Series" total={shown.length} size={seriesSize} page={currentSeriesPage} onPage={setSeriesPage}/></>:<div className="progress-filter-empty">{search?<Search size={22}/>:<Check size={22}/>}<h3>{search?'No matching series':!categorySeries.length?(category==='Anime'?'No tracked anime yet':'No tracked TV series yet'):filter==='Finished'?'No finished series yet':'All caught up'}</h3><p>{search?'Try another title or change the series filter.':!categorySeries.length?'Watch or mark episodes to start tracking this category.':filter==='Finished'?'Series appear here when every listed episode is watched.':'Your tracked series are in the Finished tab.'}</p><button onClick={()=>{setFilter('All');changeQuery('');}}>Show all series</button></div>}
            {unknown>0&&<p className="progress-note" role="status">{loading?'Loading missing episode totals…':unknown+' '+(unknown===1?'series is':'series are')+' missing episode totals. Completion and episodes left include known totals only.'}</p>}
          </section>}
          {summary.movies.length>0&&<section className="progress-section"><div className="progress-section-heading"><h2>Movies watched <span>{summary.movies.length}</span></h2></div>{movies.length?<><div className="progress-movies">{movies.slice(currentMoviePage*movieSize,(currentMoviePage+1)*movieSize).map(item=><button className="progress-movie" key={item.meta.type+':'+item.meta.id} onClick={()=>onOpen(item.meta)}><Artwork meta={item.meta}/><span><strong>{item.meta.name}</strong><small>{item.meta.releaseInfo||'Movie'}</small></span><Check size={16} aria-label="Watched"/></button>)}</div><Pagination label="Movies" total={movies.length} size={movieSize} page={currentMoviePage} onPage={setMoviePage}/></>:<p className="progress-note" role="status">No movies match your search.</p>}</section>}
        </div>
        <details className="progress-activity">
          <summary>Recent activity <ChevronRight size={17} aria-hidden="true"/></summary>
          <div className="progress-recent">{summary.recent.map((item,index)=><button className="progress-recent-row" key={item.meta.type+':'+item.meta.id+':'+index} onClick={()=>onOpen(item.meta)}><span className={'progress-recent-mark'+(item.completed?' is-complete':'')} aria-hidden="true">{item.completed?<Check size={14}/>:<Play size={13}/>}</span><span className="progress-recent-text"><strong>{item.meta.name}</strong><small>{item.label}{!item.completed?' · '+item.percent+'%':''}</small><time dateTime={new Date(item.updatedAt).toISOString()}>{when(item.updatedAt)}</time></span></button>)}</div>
          <p className="progress-note">Watched titles include their full runtime, including manual marks. Unfinished titles use saved playback progress. A series’ usual episode length is used when an individual runtime is unavailable.</p>
        </details>
        {summary.runtimeMissing>0&&<p className="progress-note" role="status">{summary.runtimeMissing} watched {summary.runtimeMissing===1?'item has':'items have'} no runtime available yet and {summary.runtimeMissing===1?'is':'are'} excluded from time watched.</p>}
      </div>
    </>}
  </section>;
}
