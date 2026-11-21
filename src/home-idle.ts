import {useEffect,useState} from 'react';
import {DRIFT_EVERY,driftSpot} from './pause-stages';

// OLED care for the TV home screen (Hero.tsx). Left alone, the menus, rows and
// text fade out and the artwork dims, with a small mark that keeps moving; later
// the screen goes black apart from that mark. Any button wakes it and does
// nothing else, so a stray press cannot open a title nobody can see.
export type HomeIdleStage='none'|'dim'|'off';
export const HOME_IDLE_AFTER={dim:120_000,off:600_000} as const;

const WAKE_EVENTS=['keydown','pointerdown','pointermove','wheel'] as const;
const JITTER_PX=8;
/** Something else has the screen: title details, the player, the TV keyboard or a list. */
const busy=()=>!!document.querySelector('dialog[open], .tv-keyboard, .tv-select');

export function useHomeIdle(enabled:boolean):{stage:HomeIdleStage;spot:[number,number]}{
  const [stage,setStage]=useState<HomeIdleStage>('none'),[step,setStep]=useState(0);
  useEffect(()=>{
    if(!enabled)return;
    const root=document.documentElement;
    let timer:ReturnType<typeof setTimeout>|undefined,current:HomeIdleStage='none';
    // Hiding the rows takes focus off the selected card; give it back on waking.
    let focused:HTMLElement|undefined;
    const show=(next:HomeIdleStage)=>{
      if(current==='none'&&next!=='none'){const active=document.activeElement;focused=active instanceof HTMLElement&&active!==document.body?active:undefined;}
      current=next;setStage(next);
      root.classList.toggle('home-idle',next!=='none');root.classList.toggle('home-idle-off',next==='off');
      if(next==='none'&&focused){if(focused.isConnected)focused.focus({preventScroll:true});focused=undefined;}
    };
    const arm=(delay:number=HOME_IDLE_AFTER.dim)=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        if(busy()){arm();return;}
        if(current==='none'){show('dim');arm(HOME_IDLE_AFTER.off-HOME_IDLE_AFTER.dim);}else show('off');
      },delay);
    };
    // A pointer held in the hand (the Magic Remote) trembles; only a real move counts.
    let anchor:[number,number]|undefined;
    // Window capture runs before the TV's own key handling (webos/bootstrap.ts).
    const wake=(event:Event)=>{
      if(event.type==='pointermove'){
        const {clientX:x,clientY:y}=event as PointerEvent;
        if(anchor&&Math.abs(x-anchor[0])+Math.abs(y-anchor[1])<JITTER_PX)return;
        anchor=[x,y];
      }
      if(current!=='none'){
        show('none');
        if(event.type==='keydown'||event.type==='pointerdown'){event.preventDefault();event.stopImmediatePropagation();}
      }
      arm();
    };
    for(const name of WAKE_EVENTS)window.addEventListener(name,wake,true);
    arm();
    return()=>{clearTimeout(timer);for(const name of WAKE_EVENTS)window.removeEventListener(name,wake,true);root.classList.remove('home-idle','home-idle-off');};
  },[enabled]);
  useEffect(()=>{
    if(stage==='none')return;
    const timer=setInterval(()=>setStep(value=>value+1),stage==='dim'?DRIFT_EVERY.dim:DRIFT_EVERY.off);
    return()=>clearInterval(timer);
  },[stage]);
  return {stage:enabled?stage:'none',spot:driftSpot(step)};
}
