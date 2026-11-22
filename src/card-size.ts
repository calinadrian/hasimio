import {useEffect,useSyncExternalStore} from 'react';
import {profileStorage} from './profile-storage';

/**
 * How large poster cards are in every shelf and grid. A display choice for
 * this device and profile, so it is not synced. CSS reads it from
 * `<html data-card-size>` (see poster.css).
 */
export type CardSize='small'|'medium'|'large';
export const CARD_SIZES:readonly {value:CardSize;label:string}[]=[
  {value:'small',label:'Small cards'},
  {value:'medium',label:'Medium cards'},
  {value:'large',label:'Large cards'},
];
const key='hasimio:card-size';
const listeners=new Set<()=>void>();
// The latest choice, which still applies for this session if it could not be saved.
let chosen:CardSize|undefined;

export function parseCardSize(value:unknown):CardSize{return value==='small'||value==='large'?value:'medium';}
export function savedCardSize():CardSize{
  try{return parseCardSize(profileStorage.getItem(key));}catch{return 'medium';}
}
export function currentCardSize():CardSize{return chosen??savedCardSize();}
export function setCardSize(size:CardSize){
  chosen=size;
  try{profileStorage.setItem(key,size);}catch{/* Storage full or blocked. */}
  for(const listener of listeners)listener();
}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}

/** The chosen size; also applies it to the page while the app runs. */
export function useCardSize():CardSize{
  const size=useSyncExternalStore(subscribe,currentCardSize,()=>'medium' as CardSize);
  useEffect(()=>{document.documentElement.dataset.cardSize=size;},[size]);
  return size;
}
