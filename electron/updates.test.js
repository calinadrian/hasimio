import {describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {createUpdates,releaseSections} from './updates.mjs';

function fakeUpdater() {
  const emitter=new EventEmitter();
  return Object.assign(emitter,{autoDownload:false,autoInstallOnAppQuit:false,autoRunAppAfterInstall:false,checkForUpdates:vi.fn(),quitAndInstall:vi.fn()});
}
describe('desktop updates',()=>{
  it('stays in dev mode without an updater',()=>{const updates=createUpdates({current:'0.1.0'});expect(updates.check().status).toBe('dev');updates.install();expect(updates.get().status).toBe('dev');});
  it('downloads automatically and installs only once ready',()=>{
    const updater=fakeUpdater(),published=[],beforeInstall=vi.fn();
    const updates=createUpdates({current:'0.1.0',updater,publish:s=>published.push(s.status),beforeInstall});
    expect([updater.autoDownload,updater.autoInstallOnAppQuit,updater.autoRunAppAfterInstall]).toEqual([true,true,true]);
    updates.check();expect(updater.checkForUpdates).not.toHaveBeenCalled();
    return Promise.resolve().then(()=>{
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
      updates.install();expect(updater.quitAndInstall).not.toHaveBeenCalled();
      updater.emit('update-available',{version:'0.2.0',releaseNotes:'### New\n- Faster starts'});
      updater.emit('download-progress',{percent:42.4});expect(updates.get().percent).toBe(42);
      updater.emit('update-downloaded',{version:'0.2.0'});
      expect(updates.get()).toMatchObject({status:'ready',version:'0.2.0',notes:[{title:'New',items:['Faster starts']}]});
      expect(updates.get().status).toBe('ready');
      updates.install();expect(beforeInstall).toHaveBeenCalled();expect(updater.quitAndInstall).toHaveBeenCalledWith(true,true);
      expect(published).toContain('installing');
    });
  });
  it('keeps a downloaded update ready while checking for a newer one',async()=>{
    const updater=fakeUpdater(),updates=createUpdates({current:'0.1.0',updater});
    updates.check();await Promise.resolve();
    updater.emit('update-available',{version:'0.1.1'});updater.emit('update-downloaded',{version:'0.1.1'});
    expect(updates.check()).toMatchObject({status:'ready',version:'0.1.1'});await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    updates.check();expect(updater.checkForUpdates).toHaveBeenCalledTimes(2); // one check at a time
    updater.emit('update-not-available');expect(updates.get()).toMatchObject({status:'ready',version:'0.1.1'});
    await Promise.resolve();updates.check();await Promise.resolve();
    updater.emit('error',new Error('net::ERR_INTERNET_DISCONNECTED'));expect(updates.get()).toMatchObject({status:'ready',version:'0.1.1'});
    updates.check();await Promise.resolve();
    updater.emit('update-available',{version:'0.1.2'});expect(updates.get()).toMatchObject({status:'downloading',version:'0.1.2'});
    updater.emit('update-downloaded',{version:'0.1.2'});expect(updates.get()).toMatchObject({status:'ready',version:'0.1.2'});
  });
  it('treats an empty release list as up to date and explains network errors',()=>{
    const updater=fakeUpdater(),updates=createUpdates({current:'0.1.0',updater});
    updater.emit('error',new Error('No published versions on GitHub'));expect(updates.get().status).toBe('latest');
    updater.emit('error',new Error('net::ERR_INTERNET_DISCONNECTED'));expect(updates.get()).toMatchObject({status:'error',message:expect.stringContaining('No connection')});
  });
  it('turns GitHub release HTML into sections',()=>{
    expect(releaseSections('<h3>Fixed</h3><ul><li>Audio &amp; subtitles</li></ul><script>x</script>')).toEqual([{title:'Fixed',items:['Audio & subtitles']}]);
    expect(releaseSections(null)).toEqual([]);
  });
});
