import {describe,expect,it} from 'vitest';
import {pickTarget,type Candidate} from './spatial';

// The TV player's bottom chrome: a full-width seek bar above one button row.
const seek:Candidate<string>={item:'seek',slider:true,box:{left:24,top:617,width:1232,height:36}};
const row=(item:string,left:number):Candidate<string>=>({item,box:{left,top:658,width:44,height:44}});
const back:Candidate<string>={item:'back',box:{left:24,top:28,width:44,height:44}};
const player=[back,seek,row('play',24),row('rewind',73),row('forward',122),row('audio',955),row('subs',1041),row('sync',1127),row('settings',1212)];

describe('remote spatial navigation',()=>{
  it('moves along the button row instead of jumping onto the seek bar',()=>{
    expect(pickTarget(row('forward',122).box,'ArrowRight',player)).toBe('audio');
    expect(pickTarget(row('audio',955).box,'ArrowLeft',player)).toBe('forward');
  });

  it('reaches the seek bar with Up from any button, not the Back arrow above it',()=>{
    expect(pickTarget(row('play',24).box,'ArrowUp',player)).toBe('seek');
    expect(pickTarget(row('subs',1041).box,'ArrowUp',player)).toBe('seek');
    expect(pickTarget(seek.box,'ArrowUp',player)).toBe('back');
  });

  it('moves straight down a poster grid',()=>{
    const poster=(item:string,left:number,top:number):Candidate<string>=>({item,box:{left,top,width:140,height:250}});
    const grid=[poster('a1',116,100),poster('a2',272,100),poster('a3',428,100),poster('b1',116,380),poster('b2',272,380),poster('b3',428,380)];
    expect(pickTarget(grid[1].box,'ArrowDown',grid)).toBe('b2');
    expect(pickTarget(grid[5].box,'ArrowUp',grid)).toBe('a3');
  });

  it('moves Down to the next row when cards on this row differ in height',()=>{
    // Continue watching: a card whose time left wraps to a second line is 24px taller.
    const tall:Candidate<string>={item:'tall',box:{left:116,top:370,width:140,height:328}};
    const short:Candidate<string>={item:'short',box:{left:272,top:370,width:140,height:304}};
    const below:Candidate<string>={item:'below',box:{left:272,top:811,width:140,height:304}};
    expect(pickTarget(short.box,'ArrowDown',[tall,short,below])).toBe('below');
    expect(pickTarget(below.box,'ArrowUp',[tall,short,below])).toBe('short');
    expect(pickTarget(tall.box,'ArrowUp',[tall,short])).toBeUndefined();
  });

  it('never enters a slider sideways, even with nothing else on the row',()=>{
    expect(pickTarget(row('settings',1212).box,'ArrowRight',player)).toBeUndefined();
    expect(pickTarget({left:0,top:617,width:10,height:36},'ArrowRight',[seek])).toBeUndefined();
  });

  it('crosses rows sideways only when leaving the sidebar',()=>{
    // From a sidebar item level with an empty part of the page into the first poster.
    const nav={left:12,top:470,width:52,height:48};
    const poster:Candidate<string>={item:'poster',box:{left:116,top:574,width:140,height:250}};
    expect(pickTarget(nav,'ArrowRight',[poster],true)).toBe('poster');
    // Inside a menu, Right at the end of a row stays put instead of dropping a row.
    expect(pickTarget(nav,'ArrowRight',[poster])).toBeUndefined();
  });
});
