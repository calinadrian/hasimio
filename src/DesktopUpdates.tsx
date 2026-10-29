import { useEffect, useState } from 'react';
import { Download, LoaderCircle, RefreshCw, RotateCw, Sparkles } from 'lucide-react';

// Present only inside the Hasimio desktop app (electron/preload.cjs).
export type UpdateState = { current: string; status: 'dev' | 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'installing' | 'error'; version?: string; percent?: number; notes?: { title: string; items: string[] }[]; checkedAt?: number; message?: string };
type DesktopApi = { getUpdate(): Promise<UpdateState>; checkForUpdates(): Promise<UpdateState>; installUpdate(): Promise<void>; onUpdate(listener: (state: UpdateState) => void): () => void };
export const desktop = (globalThis as { hasimioDesktop?: DesktopApi }).hasimioDesktop;

export function useUpdates() {
  const [state, setState] = useState<UpdateState>();
  useEffect(() => { if (!desktop) return; void desktop.getUpdate().then(setState); return desktop.onUpdate(setState); }, []);
  return state;
}

function Notes({ state }: { state: UpdateState }) {
  if (!state.notes?.length) return null;
  return <details className="update-notes"><summary>What’s new in {state.version}</summary>{state.notes.map(section => <div key={section.title}>{section.title && <strong>{section.title}</strong>}<ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul></div>)}</details>;
}

/** Shown on every page once a new version is downloaded. */
export function UpdateBanner({ state }: { state?: UpdateState }) {
  if (state?.status !== 'ready' && state?.status !== 'installing') return null;
  return <div className="source-banner update-banner" role="status"><span className="small-puzzle"><Sparkles size={18}/></span><p><strong>Hasimio {state.version} is ready.</strong> Restart to update, or it installs when you close Hasimio.</p><button className="button primary" disabled={state.status === 'installing'} onClick={() => void desktop?.installUpdate()}>{state.status === 'installing' ? <LoaderCircle size={16} className="spin"/> : <RotateCw size={16}/>} Restart to update</button></div>;
}

/** The app's version and update controls, on the Extensions page. */
export function UpdatePanel({ state }: { state?: UpdateState }) {
  if (!desktop || !state) return null;
  const busy = state.status === 'checking' || state.status === 'downloading' || state.status === 'installing';
  const status = { dev: 'Development copy. Installed copies update from GitHub.', idle: 'Updates are checked automatically.', checking: 'Checking for updates…', latest: 'You have the latest version.', downloading: `Downloading ${state.version} · ${state.percent ?? 0}%`, ready: `Version ${state.version} is ready to install.`, installing: 'Restarting to update…', error: state.message || 'The update failed.' }[state.status];
  return <section className="engine-panel update-panel" aria-label="App updates">
    <span className="engine-icon">{busy ? <LoaderCircle size={18} className="spin"/> : <Download size={18}/>}</span>
    <div>
      <h4>Hasimio {state.current}</h4>
      <p>{status}</p>
      <Notes state={state}/>
      <div className="engine-actions">
        {state.status === 'ready' && <button className="button primary" onClick={() => void desktop?.installUpdate()}><RotateCw size={16}/> Restart to update</button>}
        <button className="button secondary" disabled={busy || state.status === 'dev'} onClick={() => void desktop?.checkForUpdates()}><RefreshCw size={16}/> Check for updates</button>
      </div>
    </div>
  </section>;
}
