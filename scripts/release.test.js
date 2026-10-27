import {describe,it,expect} from 'vitest';
import {releaseNotes} from './release.mjs';

describe('release notes',()=>{
  it('groups commit subjects the way the update panel shows them',()=>{
    expect(releaseNotes(['Add library export','Fix silent MKV audio','Polish engine panel','0.1.0',''])).toBe('### New\n- Add library export\n\n### Fixed\n- Fix silent MKV audio\n\n### Improved\n- Polish engine panel');
    expect(releaseNotes(['v0.1.1'])).toBe('### Improved\n- Maintenance release');
  });
});
