import {useEffect,useRef,useState} from 'react';
import {ChevronDown,MonitorSmartphone,Puzzle,Settings,Users} from 'lucide-react';
import {currentProfile,requestProfilePicker} from './profile-storage';
import {deviceSync} from './device-sync';

// Desktop navigation (computers only; the TV keeps its rail and phones their
// tab bar). The pages people move between sit in the top bar; the rest, which
// are visited now and then, sit in the profile menu.
const pages=['Discover','Live TV','Library','Progress','Calendar'];
const menuPages=[{name:'Extensions',icon:Puzzle},{name:'Sync devices',icon:MonitorSmartphone},{name:'Settings',icon:Settings}];

export function TopNavigation({page,onNavigate}:{page:string;onNavigate:(page:string)=>void}){
  return <nav className="top-nav" aria-label="Main">{pages.map(name=>{
    const current=page===name||page==='Actor'&&name==='Discover';
    return <button key={name} aria-label={name} aria-current={current?'page':undefined} className={`nav-item${current?' active':''}`} onClick={()=>onNavigate(name)}>{name}</button>;
  })}</nav>;
}

export function ProfileMenu({page,onNavigate,syncLabel,syncState,version}:{page:string;onNavigate:(page:string)=>void;syncLabel:string;syncState:string;version:string}){
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);toggle.current?.focus();}};
    const leave=(event:FocusEvent)=>{if(event.relatedTarget instanceof Node&&!root.current?.contains(event.relatedTarget))setOpen(false);};
    const element=root.current;
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);element?.addEventListener('focusout',leave);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);element?.removeEventListener('focusout',leave);};
  },[open]);
  const profile=currentProfile();
  const go=(name:string)=>{setOpen(false);onNavigate(name);};
  const current=menuPages.some(item=>item.name===page);
  return <div className={`profile-menu${open?' open':''}${current?' current':''}`} ref={root}>
    <button ref={toggle} className="profile-menu-button" aria-haspopup="menu" aria-expanded={open} aria-label={`${profile?.name??'My profile'}: settings and profiles`} onClick={()=>setOpen(value=>!value)}>
      <span className={'profile-avatar profile-color-'+(profile?.color??0)} aria-hidden="true">{profile?.name.slice(0,1).toUpperCase()||'?'}</span>
      <ChevronDown size={16} aria-hidden="true"/>
    </button>
    {open&&<div className="profile-menu-list" role="menu" aria-label="Settings and profiles">
      {menuPages.map(({name,icon:Icon})=><button key={name} role="menuitem" aria-current={page===name?'page':undefined} onClick={()=>go(name)}><Icon size={18} aria-hidden="true"/>{name}</button>)}
      <hr/>
      <button role="menuitem" className={`sync-status ${syncState}`} onClick={()=>go('Sync devices')}><i aria-hidden="true"/>{syncLabel}</button>
      <button role="menuitem" onClick={()=>{deviceSync.capture();requestProfilePicker();location.reload();}}><Users size={18} aria-hidden="true"/>Switch profile<small>{profile?.name}</small></button>
      <small className="profile-menu-version">Hasimio v{version}</small>
    </div>}
  </div>;
}
