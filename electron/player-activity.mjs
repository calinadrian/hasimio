// Chromium on Windows can stop delivering mousemove while a window is
// unfocused or a fullscreen video's cursor is hidden. Observe the OS cursor
// independently so player controls reliably wake on hover.
export function watchPointerActivity(win,screen) {
  let timer,last;
  const stop=()=>{clearInterval(timer);timer=undefined;last=undefined;};
  const start=()=>{
    stop();last=screen.getCursorScreenPoint();
    timer=setInterval(()=>{
      if(win.isDestroyed()){stop();return;}
      const point=screen.getCursorScreenPoint(),moved=point.x!==last.x||point.y!==last.y;
      last=point;
      // Revealing controls does not require activation, so keep reporting
      // movement while another window is focused or fullscreen has lost focus.
      if(!moved||win.isMinimized())return;
      const box=win.getContentBounds();
      if(point.x>=box.x&&point.x<box.x+box.width&&point.y>=box.y&&point.y<box.y+box.height)
        win.webContents.send('hasimio:player-pointer',{x:point.x-box.x,y:point.y-box.y});
    },100);
    timer.unref?.();
  };
  start();
  win.on('closed',stop);
}
