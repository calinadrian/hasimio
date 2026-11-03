// Keep the original player window, including its caption overlay, in a small
// always-on-top mode. Video-only Chromium PiP omits HTML subtitle overlays.
export function createPictureInPicture(win,screen,isQuitting){
  let saved;
  let transition=Promise.resolve();
  const publish=enabled=>{if(!win.isDestroyed())win.webContents.send('hasimio:pip-state',enabled);};
  async function apply(enabled){
    if(win.isDestroyed())return false;
    if(enabled===!!saved)return enabled;
    if(enabled){
      saved={bounds:win.getNormalBounds(),minimum:win.getMinimumSize(),maximized:win.isMaximized(),fullscreen:win.isFullScreen(),onTop:win.isAlwaysOnTop()};
      if(saved.fullscreen){
        await new Promise(resolve=>{const done=()=>{clearTimeout(timer);win.removeListener('leave-full-screen',done);resolve();};const timer=setTimeout(done,1000);win.once('leave-full-screen',done);win.setFullScreen(false);});
      }
      if(win.isDestroyed())return false;
      if(win.isMaximized())win.unmaximize();
      const area=screen.getDisplayMatching(saved.bounds).workArea;
      const width=Math.min(560,area.width),height=Math.min(350,area.height);
      win.setMinimumSize(320,220);
      win.setAlwaysOnTop(true,'floating');
      win.setBounds({x:Math.max(area.x,area.x+area.width-width-24),y:Math.max(area.y,area.y+area.height-height-24),width,height});
      win.show();
    }else{
      const previous=saved;saved=undefined;
      win.setAlwaysOnTop(previous.onTop);
      win.setMinimumSize(...previous.minimum);
      win.setBounds(previous.bounds);
      if(previous.maximized)win.maximize();
      if(previous.fullscreen)win.setFullScreen(true);
    }
    publish(enabled);
    return enabled;
  }
  const set=enabled=>{transition=transition.catch(()=>{}).then(()=>apply(enabled));return transition;};
  // Closing the floating player returns to the normal window. File > Quit
  // still quits normally, including during installation of an update.
  win.on('close',event=>{if(saved&&!isQuitting()){event.preventDefault();void set(false);}});
  return {set};
}
