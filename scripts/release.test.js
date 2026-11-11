import {describe,it,expect} from 'vitest';
import {releaseNotes} from './release.mjs';

describe('release notes',()=>{
  it('returns desktop installation instructions for GitHub releases',()=>{
    expect(releaseNotes()).toContain('Windows: download Hasimio-Setup-<version>.exe');
    expect(releaseNotes()).toContain('macOS (Apple Silicon)');
  });
});
