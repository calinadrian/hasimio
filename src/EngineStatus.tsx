import { useSyncExternalStore } from 'react';
import { Check, Download, LoaderCircle, RefreshCw, Server } from 'lucide-react';
import { checkEngine, engineDownloadUrl, engineIsSeparate, type EngineState } from './engine';

// One shared health check for every component; it keeps retrying while the engine is missing so a fresh install is picked up.
let current: EngineState = { state: 'checking' };
let pending: Promise<void> | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
function publish(next: EngineState) { current = next; listeners.forEach(listener => listener()); }
function schedule() { clearTimeout(timer); if (listeners.size && current.state !== 'ready') timer = setTimeout(() => void recheckEngine(), 10000); }
export function recheckEngine(show = false) {
  if (pending) return pending;
  if (show) publish({ state: 'checking' });
  pending = checkEngine().then(publish).finally(() => { pending = undefined; schedule(); });
  return pending;
}
const onVisible = () => { if (document.visibilityState === 'visible') void recheckEngine(); };
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) { void recheckEngine(); document.addEventListener('visibilitychange', onVisible); }
  return () => { listeners.delete(listener); if (!listeners.size) { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); } };
}
export function useEngine() { return useSyncExternalStore(subscribe, () => current); }

export function EnginePanel({ engine }: { engine: EngineState }) {
  const download = engineDownloadUrl();
  if (engine.state === 'ready') return <div className="engine-panel ready" role="status"><span className="engine-icon"><Check size={18}/></span><p><strong>Hasimio Engine connected</strong> · v{engine.version}. Torrents download and play on this PC.</p></div>;
  if (engine.state === 'checking') return <div className="engine-panel" role="status"><span className="engine-icon"><LoaderCircle size={18} className="spin"/></span><p><strong>Looking for Hasimio Engine…</strong></p></div>;
  const outdated = engine.state === 'outdated';
  return <section className="engine-panel needed" aria-label="Hasimio Engine">
    <span className="engine-icon"><Server size={20}/></span>
    <div>
      <h4>{outdated ? 'Update Hasimio Engine' : engineIsSeparate ? 'Install Hasimio Engine to play torrents' : 'The local streaming service is not responding'}</h4>
      <p>{outdated ? `This version of Hasimio needs a newer engine than the one on this PC (v${engine.version}).` : engineIsSeparate ? 'Torrent sources play through Hasimio Engine, a small app that runs on your own PC. Downloading and playback happen on your PC, not on this website.' : (globalThis as { hasimioDesktop?: unknown }).hasimioDesktop ? 'Close Hasimio and open it again.' : 'Restart Hasimio with npm run dev or npm run preview, or start the engine with npm run engine.'}</p>
      <div className="engine-actions">
        {engineIsSeparate && (download ? <a className="button primary" href={download} target="_blank" rel="noreferrer"><Download size={16}/> {outdated ? 'Download the update' : 'Download Hasimio Engine'}</a> : <code>npm run engine</code>)}
        <button className="button secondary" onClick={() => void recheckEngine(true)}><RefreshCw size={16}/> Check again</button>
      </div>
      {engineIsSeparate && !outdated && <small>Already running? If your browser asks to allow access to devices on your local network, choose Allow, then check again.</small>}
    </div>
  </section>;
}
