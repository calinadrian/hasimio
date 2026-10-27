// The only bridge between the Hasimio page and the desktop app: update status and actions.
const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('hasimioDesktop',{
  getUpdate:()=>ipcRenderer.invoke('hasimio:update-state'),
  checkForUpdates:()=>ipcRenderer.invoke('hasimio:update-check'),
  installUpdate:()=>ipcRenderer.invoke('hasimio:update-install'),
  onUpdate(listener){
    const handler=(_event,state)=>listener(state);
    ipcRenderer.on('hasimio:update',handler);
    return ()=>ipcRenderer.removeListener('hasimio:update',handler);
  },
});
