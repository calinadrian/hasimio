import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Minus,Square,Copy,X,Play} from 'lucide-react';

type WindowState={maximized:boolean;fullscreen:boolean};
type WindowChrome={windowChrome?:boolean;windowAction?:(action:'minimize'|'maximize'|'close')=>Promise<void>;getWindowState?:()=>Promise<WindowState>;onWindowState?:(listener:(state:WindowState)=>void)=>()=>void};
const desktop=(globalThis as {hasimioDesktop?:WindowChrome}).hasimioDesktop;

export default function DesktopTitleBar(){
  const [host]=useState(()=>document.createElement('div'));
  const [maximized,setMaximized]=useState(false);
  useEffect(()=>{
    if(!desktop?.windowChrome)return;
    host.className='desktop-chrome-host';
    document.body.classList.add('hasimio-desktop-chrome');
    const place=()=>{
      // A modal makes the rest of the document inert. Keep the window buttons
      // inside the active modal so they still work while title details are open.
      const dialogs=document.querySelectorAll('dialog[open]');
      const parent=dialogs[dialogs.length-1]??document.body;
      if(host.parentElement!==parent)parent.appendChild(host);
    };
    place();
    const observer=new MutationObserver(place);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
    let live=true;
    const update=(state:WindowState)=>{if(!live)return;setMaximized(state.maximized);document.body.classList.toggle('hasimio-window-fullscreen',state.fullscreen);};
    void desktop.getWindowState?.().then(update).catch(()=>{});
    const stop=desktop.onWindowState?.(update);
    return()=>{live=false;observer.disconnect();stop?.();host.remove();document.body.classList.remove('hasimio-desktop-chrome','hasimio-window-fullscreen');};
  },[host]);
  if(!desktop?.windowChrome)return null;
  const action=(value:'minimize'|'maximize'|'close')=>{void desktop.windowAction?.(value).catch(()=>{});};
  return createPortal(<div className="desktop-titlebar">
    <span className="desktop-titlebar-name"><Play size={13} fill="currentColor"/>Hasimio</span>
    <div className="desktop-window-buttons">
      <button aria-label="Minimize window" title="Minimize" onClick={()=>action('minimize')}><Minus size={14}/></button>
      <button aria-label={maximized?'Restore window':'Maximize window'} title={maximized?'Restore':'Maximize'} onClick={()=>action('maximize')}>{maximized?<Copy size={12}/>:<Square size={12}/>}</button>
      <button className="desktop-window-close" aria-label="Close window" title="Close" onClick={()=>action('close')}><X size={15}/></button>
    </div>
  </div>,host);
}
