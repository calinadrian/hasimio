import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {removeFileListLogin} from './retired-filelist.mjs';

const folders=[];
const folder=()=>{const value=fs.mkdtempSync(path.join(os.tmpdir(),'hasimio-filelist-'));folders.push(value);return value;};
afterEach(()=>{for(const value of folders.splice(0))fs.rmSync(value,{recursive:true,force:true});});

describe('removeFileListLogin',()=>{
  it('deletes the saved login and an interrupted write, and nothing else',()=>{
    const root=folder(),login=path.join(root,'account.json');
    for(const file of [login,login+'.tmp',path.join(root,'settings.json')])fs.writeFileSync(file,'{}');
    removeFileListLogin(login);
    expect(fs.readdirSync(root)).toEqual(['settings.json']);
  });
  it('does nothing when no login was saved',()=>{
    const root=folder();
    expect(()=>removeFileListLogin(path.join(root,'account.json'))).not.toThrow();
    expect(()=>removeFileListLogin(path.join(root,'missing','account.json'))).not.toThrow();
  });
});
