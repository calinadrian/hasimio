import {useEffect,useState} from 'react';
import {playerSettings} from './preferences';

export function usePlayerSettings(){
  const [settings,setSettings]=useState(playerSettings);
  useEffect(()=>{
    const update=()=>setSettings(playerSettings());
    window.addEventListener('hasimio:settings',update);
    window.addEventListener('hasimio:remote-data',update);
    return()=>{window.removeEventListener('hasimio:settings',update);window.removeEventListener('hasimio:remote-data',update);};
  },[]);
  return settings;
}
