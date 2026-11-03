import {useRef,useState} from 'react';
import {Compass,Library,Tv,Ellipsis,CalendarDays,BarChart3,Puzzle,MonitorSmartphone,Users,ChevronRight,X,Settings} from 'lucide-react';
import {currentProfile} from '../profile-storage';
import {deviceSync} from '../device-sync';

const primary=[{name:'Discover',icon:Compass},{name:'Library',icon:Library},{name:'Live TV',icon:Tv}];
const secondary=[{name:'Calendar',icon:CalendarDays},{name:'Progress',icon:BarChart3},{name:'Extensions',icon:Puzzle},{name:'Sync devices',icon:MonitorSmartphone},{name:'Settings',icon:Settings}];

export default function MobileNavigation({page,onNavigate}:{page:string;onNavigate:(page:string)=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [expanded,setExpanded]=useState(false);
  const moreActive=secondary.some(item=>item.name===page);
  function navigate(name:string){dialog.current?.close();onNavigate(name);window.scrollTo({top:0,behavior:'instant'});}
  return <>
    <nav className="android-tabs" aria-label="Mobile navigation">
      {primary.map(({name,icon:Icon})=><button key={name} aria-current={page===name||page==='Actor'&&name==='Discover'?'page':undefined} onClick={()=>navigate(name)}><Icon size={22}/><span>{name}</span></button>)}
      <button className={moreActive?'is-current':''} aria-haspopup="dialog" aria-expanded={expanded} onClick={()=>{dialog.current?.showModal();setExpanded(true);}}><Ellipsis size={24}/><span>More</span></button>
    </nav>
    <dialog ref={dialog} className="android-more" aria-labelledby="android-more-title" onCancel={()=>dialog.current?.close()} onClose={()=>setExpanded(false)} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}>
      <div className="android-more-content">
        <header><h2 id="android-more-title">More</h2><button className="icon-button" aria-label="Close menu" onClick={()=>dialog.current?.close()}><X size={22}/></button></header>
        <div className="android-more-links">{secondary.map(({name,icon:Icon})=><button key={name} aria-current={page===name?'page':undefined} onClick={()=>navigate(name)}><Icon size={22}/><span>{name}</span><ChevronRight size={18}/></button>)}</div>
        <button className="android-profile" onClick={()=>{deviceSync.capture();location.reload();}}><span className={'profile-avatar profile-color-'+(currentProfile()?.color??0)} aria-hidden="true">{currentProfile()?.name.slice(0,1).toUpperCase()||'?'}</span><span><strong>{currentProfile()?.name||'My profile'}</strong><small>Switch profile</small></span><Users size={21}/></button>
      </div>
    </dialog>
  </>;
}
