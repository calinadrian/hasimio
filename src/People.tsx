import {useEffect,useState} from 'react';
import {ChevronLeft,LoaderCircle,UserRound} from 'lucide-react';
import {engineUrl} from './engine';
import {type Meta,safeHttp} from './media';
import Poster from './Poster';
import MediaShelf from './MediaShelf';
import './people.css';

export type Person={id:string;name:string;titles?:number;role?:string};
type ActorPhoto={image:string;source:string;credit:string;license:string;licenseUrl?:string};
function useActorPhotos(people:Person[]){
  const ids=people.map(p=>p.id).filter(id=>/^nm\d+$/.test(id)).sort().join(',');
  const [photos,setPhotos]=useState<Record<string,ActorPhoto>>({});
  useEffect(()=>{
    setPhotos({});if(!ids)return;
    const controller=new AbortController();
    void fetch(engineUrl('/api/people/photos?ids='+encodeURIComponent(ids)),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])})
      .then(async response=>{if(response.ok){const data=await response.json();if(!controller.signal.aborted)setPhotos(data.photos??{});}}).catch(()=>{});
    return()=>controller.abort();
  },[ids]);
  return photos;
}
function Portrait({photo,large=false}:{photo?:ActorPhoto;large?:boolean}){
  const image=safeHttp(photo?.image);
  return <span className={'person-avatar'+(large?' person-avatar-large':'')}><UserRound size={large?32:20}/>{image&&<img key={image} src={image} alt="" loading="lazy" decoding="async" title={[photo?.credit,photo?.license].filter(Boolean).join(' · ')} onError={event=>{event.currentTarget.style.display='none';}}/>}</span>;
}
type PeopleData={people?:Person[];cast?:Person[];person?:Person;metas?:Meta[];hasMore?:boolean};
async function request(path:string,signal?:AbortSignal):Promise<PeopleData>{
  const response=await fetch(engineUrl('/api/people/'+path),{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Actor information is unavailable.'),{building:data.state==='building'});return data;
}
function usePeople(path:string){
  const [data,setData]=useState<PeopleData>(),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;setData(undefined);setError('');setLoading(true);
    async function load(){try{setData(await request(path,controller.signal));setError('');}catch(e){if(controller.signal.aborted)return;setError(e instanceof Error?e.message:'Actor information is unavailable.');if((e as {building?:boolean}).building)timer=setTimeout(()=>void load(),5000);}finally{if(!controller.signal.aborted)setLoading(false);}}
    timer=setTimeout(()=>void load(),250);return()=>{controller.abort();clearTimeout(timer);};
  },[path,retry]);
  const refresh=async()=>{await fetch(engineUrl('/api/people/retry'),{method:'POST'}).catch(()=>{});setRetry(n=>n+1);};
  return {data,error,loading,refresh};
}
function Status({loading,error,onRetry}:{loading:boolean;error:string;onRetry:()=>void}){
  return <>{loading&&<p className="people-status" role="status"><LoaderCircle size={16} className="spin"/>Loading actor information…</p>}{error&&<div className="people-status" role="status"><p>{error}</p><button className="button secondary" onClick={onRetry}>Retry</button></div>}</>;
}
function PersonButton({person,onSelect,photo}:{person:Person;onSelect:(person:Person)=>void;photo?:ActorPhoto}){
  return <button className="person-button" onClick={()=>onSelect(person)}><Portrait photo={photo}/><span><strong>{person.name}</strong>{person.role?<small>{person.role}</small>:person.titles!==undefined?<small>{person.titles} indexed {person.titles===1?'title':'titles'}</small>:null}</span></button>;
}
function PeopleList({people,onSelect}:{people:Person[];onSelect:(person:Person)=>void}){
  const photos=useActorPhotos(people);
  return <div className="people-list">{people.map(person=><PersonButton key={person.id} person={person} onSelect={onSelect} photo={photos[person.id]}/>)}</div>;
}
export function ActorSearch({query,onSelect}:{query:string;onSelect:(person:Person)=>void}){
  const {data,error,loading,refresh}=usePeople('search?q='+encodeURIComponent(query));
  return <section className="people-section" aria-label="Actor search"><h2>Actors</h2><Status loading={loading} error={error} onRetry={()=>void refresh()}/>{data?.people?.length?<PeopleList people={data.people} onSelect={onSelect}/>:data&&!error?<p className="people-status">No matching actors in Hasimio’s index.</p>:null}</section>;
}
export function TitleCast({meta,onSelect}:{meta:Meta;onSelect:(person:Person)=>void}){
  return /^tt\d+$/.test(meta.id)?<Cast id={meta.id} onSelect={onSelect}/>:null;
}
function Cast({id,onSelect}:{id:string;onSelect:(person:Person)=>void}){
  const {data,error,loading,refresh}=usePeople('title/'+id+'/cast');
  return <section className="people-section" aria-label="Cast"><h3>Cast</h3><Status loading={loading} error={error} onRetry={()=>void refresh()}/><PeopleList people={data?.cast??[]} onSelect={onSelect}/>{data&&!data.cast?.length&&<p className="people-status">No cast credits are available for this title.</p>}</section>;
}
export function ActorTitles({person,onBack,onOpen,saved}:{person:Person;onBack:()=>void;onOpen:(meta:Meta)=>void;saved:(meta:Meta)=>boolean}){
  const [type,setType]=useState(''),[items,setItems]=useState<Meta[]>([]),[hasMore,setHasMore]=useState(false);
  const photo=useActorPhotos([person])[person.id];
  const path=person.id+'/credits?type='+encodeURIComponent(type);
  const {data,error,loading,refresh}=usePeople(path);
  useEffect(()=>{setItems(data?.metas??[]);setHasMore(!!data?.hasMore);},[data]);
  return <section className="actor-page"><button className="shelf-back" onClick={onBack}><ChevronLeft size={17}/>Back to Discover</button><div className="section-intro"><div className="actor-heading"><Portrait photo={photo} large/><div><h1>{person.name}</h1>{photo&&safeHttp(photo.source)&&<a className="actor-photo-credit" href={safeHttp(photo.source)} target="_blank" rel="noreferrer">Photo: {photo.credit||'Wikimedia Commons'}{photo.license?' · '+photo.license:''}</a>}</div></div><label className="actor-filter"><span className="sr-only">Filter actor titles</span><select aria-label="Filter actor titles" value={type} onChange={e=>setType(e.target.value)}><option value="">All titles</option><option value="movie">Movies</option><option value="series">TV series</option></select></label></div><p className="people-status">Cast credits for titles available in Hasimio’s IMDb index.</p><Status loading={loading} error={error} onRetry={()=>void refresh()}/>{items.length>0&&<MediaShelf title={type==='movie'?'Movies':type==='series'?'TV series':'Movies and series'} wrap hasMore={hasMore} onMore={async()=>{try{const next=await request(path+'&skip='+items.length);setItems(previous=>[...previous,...(next.metas??[]).filter(m=>!previous.some(p=>p.id===m.id))]);setHasMore(!!next.hasMore);return true;}catch{return false;}}}>{items.map(meta=><Poster key={meta.id} meta={meta} saved={saved(meta)} onClick={()=>onOpen(meta)}/>)}</MediaShelf>}{data&&!loading&&!error&&!items.length&&<p className="people-status">No credits in this category.</p>}</section>;
}
