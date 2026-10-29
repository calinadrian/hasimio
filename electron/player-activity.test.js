import {describe,it,expect,vi,afterEach} from 'vitest';
import {EventEmitter} from 'node:events';
import {watchPointerActivity} from './player-activity.mjs';

afterEach(()=>vi.useRealTimers());
describe('player pointer activity',()=>{
  it('reports movement inside the window without needing focus, stays quiet at rest, and stops when closed',()=>{
    vi.useFakeTimers();
    let point={x:120,y:80};
    const win=Object.assign(new EventEmitter(),{isDestroyed:()=>false,isMinimized:()=>false,getContentBounds:()=>({x:100,y:50,width:800,height:600}),webContents:{send:vi.fn()}});
    watchPointerActivity(win,{getCursorScreenPoint:()=>point});
    vi.advanceTimersByTime(4000);expect(win.webContents.send).not.toHaveBeenCalled();
    point={x:121,y:80};vi.advanceTimersByTime(100);
    expect(win.webContents.send).toHaveBeenCalledWith('hasimio:player-pointer',{x:21,y:30});
    vi.advanceTimersByTime(3500);expect(win.webContents.send).toHaveBeenCalledTimes(1);
    point={x:99,y:80};vi.advanceTimersByTime(100);expect(win.webContents.send).toHaveBeenCalledTimes(1);
    point={x:150,y:80};vi.advanceTimersByTime(100);expect(win.webContents.send).toHaveBeenCalledTimes(2);
    win.emit('closed');expect(vi.getTimerCount()).toBe(0);
    point={x:160,y:80};vi.advanceTimersByTime(100);expect(win.webContents.send).toHaveBeenCalledTimes(2);
  });
  it('ignores movement while minimized and stops if the window is destroyed',()=>{
    vi.useFakeTimers();
    let point={x:120,y:80},minimized=false,destroyed=false;
    const win=Object.assign(new EventEmitter(),{isDestroyed:()=>destroyed,isMinimized:()=>minimized,getContentBounds:()=>({x:100,y:50,width:800,height:600}),webContents:{send:vi.fn()}});
    watchPointerActivity(win,{getCursorScreenPoint:()=>point});
    minimized=true;point={x:130,y:80};vi.advanceTimersByTime(100);expect(win.webContents.send).not.toHaveBeenCalled();
    minimized=false;point={x:140,y:80};vi.advanceTimersByTime(100);expect(win.webContents.send).toHaveBeenCalledTimes(1);
    destroyed=true;point={x:150,y:80};vi.advanceTimersByTime(100);expect(vi.getTimerCount()).toBe(0);
  });
});
