// The only bridge between the Hasimio page and the desktop app: update status and actions.
const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('hasimioDesktop',{
  windowChrome:process.platform==='win32',
  windowAction:action=>ipcRenderer.invoke('hasimio:window-action',action),
  getWindowState:()=>ipcRenderer.invoke('hasimio:window-state'),
  onWindowState(listener){const handler=(_event,state)=>listener(state);ipcRenderer.on('hasimio:window-state',handler);return ()=>ipcRenderer.removeListener('hasimio:window-state',handler);},
  setPictureInPicture:enabled=>ipcRenderer.invoke('hasimio:pip',enabled),
  onPictureInPicture(listener){const handler=(_event,enabled)=>listener(enabled);ipcRenderer.on('hasimio:pip-state',handler);return ()=>ipcRenderer.removeListener('hasimio:pip-state',handler);},
  onPlayerPointer(listener){
    const handler=(_event,point)=>listener(point);
    ipcRenderer.on('hasimio:player-pointer',handler);
    return ()=>ipcRenderer.removeListener('hasimio:player-pointer',handler);
  },
  getUpdate:()=>ipcRenderer.invoke('hasimio:update-state'),
  checkForUpdates:()=>ipcRenderer.invoke('hasimio:update-check'),
  installUpdate:()=>ipcRenderer.invoke('hasimio:update-install'),
  onUpdate(listener){
    const handler=(_event,state)=>listener(state);
    ipcRenderer.on('hasimio:update',handler);
    return ()=>ipcRenderer.removeListener('hasimio:update',handler);
  },
});
