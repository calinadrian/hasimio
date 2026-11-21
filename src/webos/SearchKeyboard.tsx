import {useState,type ReactNode} from 'react';
import {Delete} from 'lucide-react';

// Search types diacritics-free (search ignores accents), so plain letters cover
// Romanian titles too: "insula" finds "Insula Iubirii".
const ROWS=['abcdefghijklm','nopqrstuvwxyz','0123456789'];

/**
 * The TV's own search keyboard, as on Netflix: an even grid the remote moves
 * through, with results updating below as you type. The webOS keyboard never
 * opens over the page, so Up/Down cannot get stuck in it. Back here closes it.
 */
export default function SearchKeyboard({value,onChange,onDone}:{value:string;onChange:(value:string)=>void;onDone:()=>void}){
  const [last,setLast]=useState('a');
  const press=(key:string,next:string)=>{setLast(key);onChange(next);};
  const key=(id:string,label:ReactNode,next:()=>string,extra?:{className?:string;ariaLabel?:string;autoFocus?:boolean})=>
    <button key={id} type="button" className={'tv-key'+(extra?.className?' '+extra.className:'')} aria-label={extra?.ariaLabel} autoFocus={extra?.autoFocus} data-last={last===id?'':undefined} onClick={()=>press(id,next())}>{label}</button>;
  return <section className="tv-keyboard" aria-label="Search keyboard">
    <div className="tv-keyboard-query" aria-live="polite">{value?<>{value}<i aria-hidden="true"/></>:<span>Search titles or actors</span>}</div>
    {ROWS.map((row,index)=><div className="tv-keyboard-row" key={row}>
      {row.split('').map((letter,position)=>key(letter,letter,()=>value+letter,{autoFocus:index===0&&position===0}))}
      {index===2&&<>
        {key('space','Space',()=>value&&!value.endsWith(' ')?value+' ':value,{className:'label'})}
        {key('delete',<Delete size={20}/>,()=>value.slice(0,-1),{ariaLabel:'Delete'})}
        {key('clear','Clear',()=>'',{className:'label'})}
      </>}
    </div>)}
    <button type="button" hidden data-keyboard-done onClick={onDone}/>
  </section>;
}
