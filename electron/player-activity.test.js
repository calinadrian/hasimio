import {describe,it,expect,vi,afterEach} from 'vitest';
import {EventEmitter} from 'node:events';
import {watchFullscreenPointer} from './player-activity.mjs';

afterEach(()=>vi.useRealTimers());
describe('fullscreen pointer activity',()=>{
  it('wakes on real movement without DOM events, stays quiet at rest, and stops on exit',()=>{
    vi.useFakeTimers();
    let point={x:120,y:80};
    const win=Object.assign(new EventEmitter(),{isDestroyed:()=>false,isFocused:vi.fn(()=>true),getContentBounds:()=>({x:100,y:50,width:800,height:600}),webContents:{send:vi.fn()}});
    watchFullscreenPointer(win,{getCursorScreenPoint:()=>point});
    win.emit('enter-html-full-screen');
    vi.advanceTimersByTime(4000);expect(win.webContents.send).not.toHaveBeenCalled();
    for(let i=0;i<3;i++){
      point={x:point.x+1,y:point.y};vi.advanceTimersByTime(100);
      expect(win.webContents.send).toHaveBeenCalledTimes(i+1);
      vi.advanceTimersByTime(3500);expect(win.webContents.send).toHaveBeenCalledTimes(i+1);
    }
    point={x:99,y:80};vi.advanceTimersByTime(100);expect(win.webContents.send).toHaveBeenCalledTimes(3);
    win.isFocused.mockReturnValue(false);point={x:150,y:80};vi.advanceTimersByTime(100);expect(win.webContents.send).toHaveBeenCalledTimes(3);
    win.emit('leave-html-full-screen');expect(vi.getTimerCount()).toBe(0);
    win.emit('enter-html-full-screen');win.emit('enter-html-full-screen');expect(vi.getTimerCount()).toBe(1);
    win.emit('closed');expect(vi.getTimerCount()).toBe(0);
  });
});
