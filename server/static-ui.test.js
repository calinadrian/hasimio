import {describe,it,expect} from 'vitest';
import path from 'node:path';
import {resolveFile} from './static-ui.mjs';

describe('UI file server paths',()=>{
  const root=path.resolve('ui-root');
  it('serves files inside the folder and index.html for app routes',()=>{
    expect(resolveFile(root,'/')).toBe(path.join(root,'index.html'));
    expect(resolveFile(root,'/library')).toBe(path.join(root,'index.html'));
    expect(resolveFile(root,'/assets/index-abc.js')).toBe(path.join(root,'assets','index-abc.js'));
    expect(resolveFile(root,'/downloads/Hasimio%20Engine.zip')).toBe(path.join(root,'downloads','Hasimio Engine.zip'));
  });
  it('refuses anything outside the folder',()=>{
    for(const url of ['/../package.json','/%2e%2e/package.json','/assets/../../secret.txt','/..%5csecret.txt','/a%00.js','/%E0%A4%A.js'])expect(resolveFile(root,url)).toBeUndefined();
  });
});
