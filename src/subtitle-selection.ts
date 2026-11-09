import {useMemo,useState} from 'react';
import {readStoredJson,storedJson} from './compact-json';
import {profileStorage} from './profile-storage';

export type SubtitleFile={text:string;label:string;language:string;online?:string};
export type SubtitleChoice={kind:'off'}|{kind:'file';file:SubtitleFile}|{kind:'embedded';source:string;index:number;language:string;title?:string};
export type SubtitleSelection={choice?:SubtitleChoice;choose:(choice?:SubtitleChoice)=>void;error?:string};

const storageKey='hasimio:subtitle-choices:v1';
const storageBudget=1_000_000;

function entries():[string,string][]{
  const text=profileStorage.getItem(storageKey);
  try{
    const value:unknown=JSON.parse(text??'[]');
    return Array.isArray(value)?value.filter(row=>Array.isArray(row)&&typeof row[0]==='string'&&typeof row[1]==='string'):[];
  }catch{return [];}
}

function readChoice(key:string):SubtitleChoice|undefined{
  try{
    const text=entries().find(([id])=>id===key)?.[1];
    if(!text)return;
    const choice=readStoredJson<SubtitleChoice>(text);
    if(choice?.kind==='off')return choice;
    if(choice?.kind==='embedded'&&typeof choice.source==='string'&&Number.isSafeInteger(choice.index)&&typeof choice.language==='string')return choice;
    if(choice?.kind==='file'&&typeof choice.file?.text==='string'&&typeof choice.file.label==='string'&&typeof choice.file.language==='string')return choice;
  }catch{/* Missing or unreadable saved choices fall back to automatic subtitles. */}
}

function saveChoice(key:string,choice?:SubtitleChoice){
  const recent=entries().filter(([id])=>id!==key);
  if(choice)recent.push([key,storedJson(choice)]);
  // Retain recent choices while leaving room for the profile's playback history and settings.
  let size=2;
  const kept:[string,string][]=[];
  for(const row of recent.reverse()){
    size+=JSON.stringify(row).length+1;
    if(size>storageBudget)break;
    kept.push(row);
  }
  if(choice&&!kept.length)throw Error('This subtitle is too large to save.');
  profileStorage.setItem(storageKey,JSON.stringify(kept.reverse()));
}

export function useSubtitleSelection(key?:string):SubtitleSelection{
  const saved=useMemo(()=>key?readChoice(key):undefined,[key]);
  const [override,setOverride]=useState<{key?:string;choice?:SubtitleChoice;error?:string}>();
  function choose(choice?:SubtitleChoice){
    let error:string|undefined;
    try{if(key)saveChoice(key,choice);}catch{error='Subtitles changed for this session. Hasimio could not save the choice.';}
    setOverride({key,choice,error});
  }
  return override&&override.key===key?{choice:override.choice,choose,error:override.error}:{choice:saved,choose};
}
