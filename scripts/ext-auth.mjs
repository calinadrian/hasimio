import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openAuthenticatedSession} from './browser-auth.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),args=process.argv.slice(2);
const command=args.find(arg=>!arg.startsWith('--'))??'login';
if(!['login','check','probe'].includes(command)||args.some(arg=>arg.startsWith('--')&&!['--state-only','--headless'].includes(arg))){
  console.error('Usage: npm run auth:ext -- [login|check|probe] [--state-only] [--headless]');process.exit(2);
}
const controller=new AbortController();
process.once('SIGINT',()=>controller.abort(new Error('Login cancelled.')));
process.once('SIGTERM',()=>controller.abort(new Error('Login cancelled.')));
const config={
  loginUrl:'https://ext.to/browse/',checkUrl:'https://ext.to/browse/',authenticatedSelector:'table.search-table',
  statePath:path.join(root,'playwright/.auth/ext-state.json'),profileDir:path.join(root,'playwright/.auth/ext-profile'),
  channel:process.env.HASIMIO_AUTH_BROWSER??'chrome',mode:args.includes('--state-only')?'state':'profile',headless:args.includes('--headless'),
};
async function open(interactive,overrides={}){
  return openAuthenticatedSession({...config,interactive,...overrides},{signal:controller.signal,onLoginRequired:()=>{
    console.log('Complete EXT verification manually in the browser window. This command will save state once the search table appears.');
    console.log('Close the browser or press Ctrl+C to cancel.');
  }});
}
async function report(session){
  console.log(`${session.reused?'Reused':'Saved'} verified ${session.mode} session; ${await session.page.locator('a.torrent-title-link').count()} result links found.`);
}
try{
  const session=await open(command!=='check');
  try{await report(session);}finally{await session.close();}
  if(command==='probe'){
    // Deliberately separate processes/contexts: a state file is not proof that the site accepts it.
    let accepted=0;
    for(const mode of ['state','profile']){
      try{const restored=await open(false,{mode});try{await report(restored);accepted++;}finally{await restored.close();}}
      catch(error){if(error.code!=='AUTH_REQUIRED')throw error;console.log(`Saved ${mode} session was not accepted; manual verification is required.`);}
    }
    if(!accepted)process.exitCode=2;
  }
}catch(error){
  console.error(error.code==='AUTH_REQUIRED'?error.message:controller.signal.aborted?'Login cancelled.':'Browser auth failed. Check that Chrome is installed and the dedicated profile is not open elsewhere.');
  process.exitCode=error.code==='AUTH_REQUIRED'?2:1;
}
