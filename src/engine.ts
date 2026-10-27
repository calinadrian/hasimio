/// <reference types="vite/client" />
import { engineCompatible } from '../shared/engine-api.mjs';
// Where the torrent streaming API lives. Unset: the same origin, as with npm run dev / preview.
// Hosted builds set VITE_ENGINE_URL=http://127.0.0.1:11475 so each visitor's own Hasimio Engine does the work.
export function engineBase(configured: string | undefined = import.meta.env.VITE_ENGINE_URL) {
  if (configured) return new URL(configured).origin;
  return typeof location === 'undefined' ? 'http://127.0.0.1' : location.origin;
}
export function engineUrl(path: string) { return new URL(path, engineBase()).href; }
export const engineIsSeparate = Boolean(import.meta.env.VITE_ENGINE_URL);
// Where visitors download the engine installer; hosted builds set VITE_ENGINE_DOWNLOAD_URL (absolute, or relative to the site).
export function engineDownloadUrl(configured: string | undefined = import.meta.env.VITE_ENGINE_DOWNLOAD_URL) {
  if (!configured) return undefined;
  try { const url = new URL(configured, typeof location === 'undefined' ? undefined : location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

export type EngineState = { state: 'checking' } | { state: 'missing' } | { state: 'ready' | 'outdated'; version: string };
export async function checkEngine(fetcher: typeof fetch = fetch): Promise<EngineState> {
  try {
    const response = await fetcher(engineUrl('/api/streaming/health'), { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return { state: 'missing' };
    const health = await response.json();
    const version = typeof health?.engineVersion === 'string' ? health.engineVersion : 'unknown';
    return { state: engineCompatible(health) ? 'ready' : 'outdated', version };
  } catch { return { state: 'missing' }; }
}
