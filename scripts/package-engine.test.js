import {describe,it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {dependencyFolders,launcherScript} from './package-engine.mjs';

async function fakeProject(packages) {
  const root=await mkdtemp(path.join(tmpdir(),'hasimio-pkg-'));
  for(const [folder,manifest] of Object.entries(packages)){await mkdir(path.join(root,folder),{recursive:true});await writeFile(path.join(root,folder,'package.json'),JSON.stringify(manifest));}
  return root;
}
describe('engine packaging',()=>{
  it('collects top-level folders for direct, nested, scoped and installed optional dependencies',async()=>{
    const root=await fakeProject({
      'node_modules/engine':{dependencies:{a:'1','@scope/b':'1'},optionalDependencies:{missing:'1',opt:'1'}},
      'node_modules/a':{dependencies:{c:'2'}},
      'node_modules/a/node_modules/c':{dependencies:{d:'1'}},
      'node_modules/c':{},
      'node_modules/@scope/b':{},
      'node_modules/d':{},
      'node_modules/opt':{},
      'node_modules/unused':{},
    });
    try {expect(await dependencyFolders(['engine'],root)).toEqual(['@scope/b','a','d','engine','opt']);}
    finally {await rm(root,{recursive:true,force:true});}
  });
  it('fails clearly when a required dependency is not installed',async()=>{
    const root=await fakeProject({'node_modules/engine':{dependencies:{gone:'1'}}});
    try {await expect(dependencyFolders(['engine'],root)).rejects.toThrow('gone is required');}
    finally {await rm(root,{recursive:true,force:true});}
  });
  it('starts the bundled runtime with the package config and pauses only on errors',()=>{
    const script=launcherScript();
    expect(script).toContain('"%~dp0runtime\\node.exe" "%~dp0app\\server\\engine.mjs" --config "%~dp0engine.json" %*');
    expect(script).toContain('if errorlevel 1 pause');expect(script.split('\r\n').length).toBeGreaterThan(4);
  });
});
