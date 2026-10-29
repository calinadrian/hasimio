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
      let report=point.x>=box.x&&point.x<box.x+box.width&&point.y>=box.y&&point.y<box.y+box.height;
      // A fullscreen player covers one display, so movement anywhere on that display is over the player even
      // when cached bounds disagree with the cursor (page zoom, mixed-DPI monitors). Other displays stay quiet.
      if(!report&&win.isFullScreen()){
        const display=screen.getDisplayMatching(box).bounds;
        report=point.x>=display.x&&point.x<display.x+display.width&&point.y>=display.y&&point.y<display.y+display.height;
      }
      if(report)win.webContents.send('hasimio:player-pointer',{x:point.x-box.x,y:point.y-box.y});
    },50);
    timer.unref?.();
  };
  start();
  win.on('closed',stop);
}
