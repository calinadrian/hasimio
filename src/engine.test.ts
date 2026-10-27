import { describe, expect, it } from 'vitest';
import { checkEngine, engineBase, engineDownloadUrl, engineUrl } from './engine';
import { ENGINE_API_VERSION, engineCompatible } from '../shared/engine-api.mjs';
import { resourceUrl } from './media';

describe('engine base URL', () => {
  it('uses a configured engine origin and ignores any path on it', () => {
    expect(engineBase('http://127.0.0.1:11475')).toBe('http://127.0.0.1:11475');
    expect(engineBase('http://127.0.0.1:11475/ignored/')).toBe('http://127.0.0.1:11475');
  });
  it('falls back to the page origin when unset', () => {
    expect(engineBase('')).toBe('http://127.0.0.1');
    expect(engineUrl('/api/torrents/abc')).toBe('http://127.0.0.1/api/torrents/abc');
  });
  it('resolves the built-in relative add-on against the engine, leaving remote add-ons alone', () => {
    expect(resourceUrl('/api/extensions/piratebay/manifest.json', 'stream', 'movie', 'tt1')).toBe('http://127.0.0.1/api/extensions/piratebay/stream/movie/tt1.json');
    expect(resourceUrl('https://v3-cinemeta.strem.io/manifest.json', 'meta', 'movie', 'tt1')).toBe('https://v3-cinemeta.strem.io/meta/movie/tt1.json');
  });
});
describe('engine version handshake', () => {
  const health = (body: unknown, init?: ResponseInit) => async () => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, ...init });
  it('treats engines without a new enough API as outdated', () => {
    expect(engineCompatible({ available: true, apiVersion: ENGINE_API_VERSION })).toBe(true);
    expect(engineCompatible({ available: true })).toBe(false);
    expect(engineCompatible({ available: true, apiVersion: ENGINE_API_VERSION }, ENGINE_API_VERSION + 1)).toBe(false);
    expect(engineCompatible({ available: false, apiVersion: ENGINE_API_VERSION })).toBe(false);
  });
  it('reports ready, outdated and missing engines', async () => {
    expect(await checkEngine(health({ available: true, apiVersion: ENGINE_API_VERSION, engineVersion: '0.2.0' }))).toEqual({ state: 'ready', version: '0.2.0' });
    expect(await checkEngine(health({ available: true }))).toEqual({ state: 'outdated', version: 'unknown' });
    expect(await checkEngine(health({ error: 'no' }, { status: 403 }))).toEqual({ state: 'missing' });
    expect(await checkEngine(async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }))).toEqual({ state: 'missing' });
    expect(await checkEngine(async () => { throw new TypeError('Failed to fetch'); })).toEqual({ state: 'missing' });
  });
  it('only offers http(s) download links', () => {
    expect(engineDownloadUrl('https://hasimio.example/engine.zip')).toBe('https://hasimio.example/engine.zip');
    expect(engineDownloadUrl('javascript:alert(1)')).toBeUndefined();
    expect(engineDownloadUrl('')).toBeUndefined();
  });
});
