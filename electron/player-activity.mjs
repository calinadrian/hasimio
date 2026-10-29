// Chromium on Windows can stop delivering mousemove while a fullscreen video's
// cursor is hidden. Observe the OS cursor independently until HTML fullscreen ends.
export function watchFullscreenPointer(win,screen) {
  let timer,last;
  const stop=()=>{clearInterval(timer);timer=undefined;last=undefined;};
  const start=()=>{
    stop();last=screen.getCursorScreenPoint();
    timer=setInterval(()=>{
      const point=screen.getCursorScreenPoint(),moved=point.x!==last.x||point.y!==last.y;
      last=point;
      if(!moved||win.isDestroyed()||!win.isFocused())return;
      const box=win.getContentBounds();
      if(point.x>=box.x&&point.x<box.x+box.width&&point.y>=box.y&&point.y<box.y+box.height)
        win.webContents.send('hasimio:player-pointer');
    },100);
    timer.unref?.();
  };
  win.on('enter-html-full-screen',start);
  win.on('leave-html-full-screen',stop);
  win.on('closed',stop);
}
