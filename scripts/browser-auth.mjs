import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export class AuthRequiredError extends Error {
  constructor(message='The saved session is missing or expired. Run the interactive login flow.'){
    super(message);this.name='AuthRequiredError';this.code='AUTH_REQUIRED';
  }
}
function webUrl(value){
  const url=new URL(value);
  if(url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Use HTTPS, or HTTP on localhost, without embedded credentials.');
  return url;
}
export function authOptions(options){
  const login=webUrl(options.loginUrl),check=webUrl(options.checkUrl??options.loginUrl);
  if(!options.authenticatedSelector?.trim())throw new Error('An authenticated-page selector is required.');
  if(!options.statePath||!options.profileDir)throw new Error('Dedicated state and profile paths are required.');
  const mode=options.mode??'profile';if(!['profile','state'].includes(mode))throw new Error('Auth mode must be profile or state.');
  return {...options,loginUrl:login.href,checkUrl:check.href,origin:check.origin,mode,channel:options.channel??'chrome',statePath:path.resolve(options.statePath),profileDir:path.resolve(options.profileDir),checkTimeoutMs:options.checkTimeoutMs??5000,loginTimeoutMs:options.loginTimeoutMs??300000};
}
export async function readAuthState(file){
  try{
    const data=JSON.parse(await readFile(file,'utf8'));
    if(!Array.isArray(data.cookies)||!Array.isArray(data.origins))throw new Error();
    return data;
  }catch(error){if(error.code==='ENOENT')return;throw new Error('Saved browser state is unreadable. Move the state file aside and log in again.');}
}
export async function saveAuthState(context,file){
  // IndexedDB matters for sites that keep their session there. Never print this object.
  const state=await context.storageState({indexedDB:true});
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=`${file}.${randomUUID()}.tmp`;
  try{await writeFile(temporary,JSON.stringify(state),{flag:'wx',mode:0o600});await rename(temporary,file);}
  finally{await rm(temporary,{force:true});}
}
async function authenticated(page,config,timeout){
  try{
    await page.waitForURL(url=>url.origin===config.origin,{timeout,waitUntil:'domcontentloaded'});
    await page.locator(config.authenticatedSelector).first().waitFor({state:'visible',timeout});
    return new URL(page.url()).origin===config.origin;
  }catch{return false;}
}

/** Opens an isolated session. Humans complete login, MFA and verification in the visible page. */
export async function openAuthenticatedSession(options,{chromium,onLoginRequired=()=>{},signal}={}){
  const config=authOptions(options);
  signal?.throwIfAborted();
  if(config.interactive&&config.headless)throw new Error('Interactive login requires a visible browser.');
  chromium??=(await import('playwright')).chromium;
  let browser,context,page,closing;
  const close=()=>closing??=(async()=>{signal?.removeEventListener('abort',abort);try{await context?.close();}finally{await browser?.close();}})();
  const abort=()=>{void close().catch(()=>{});};
  try{
    const launch={channel:config.channel,headless:config.headless??false,timeout:30000};
    if(config.mode==='profile'){
      await mkdir(config.profileDir,{recursive:true,mode:0o700});
      context=await chromium.launchPersistentContext(config.profileDir,{...launch,acceptDownloads:false});
      // Chrome can discard session cookies on exit even when the profile persists.
      // Restore missing session cookies, retaining any newer values in the profile.
      const state=await readAuthState(config.statePath),current=await context.cookies();
      const missing=(state?.cookies??[]).filter(cookie=>cookie.expires===-1&&!current.some(item=>item.name===cookie.name&&item.domain===cookie.domain&&item.path===cookie.path));
      if(missing.length)await context.addCookies(missing);
    }else{
      const storageState=await readAuthState(config.statePath);
      browser=await chromium.launch(launch);
      context=await browser.newContext({storageState,acceptDownloads:false});
    }
    signal?.throwIfAborted();signal?.addEventListener('abort',abort,{once:true});
    page=context.pages()[0]??await context.newPage();
    await page.goto(config.checkUrl,{waitUntil:'domcontentloaded',timeout:30000});
    const reused=await authenticated(page,config,config.checkTimeoutMs);
    if(!reused){
      signal?.throwIfAborted();
      if(!config.interactive)throw new AuthRequiredError();
      if(page.url()!==config.loginUrl)await page.goto(config.loginUrl,{waitUntil:'domcontentloaded',timeout:30000});
      await page.bringToFront();
      await onLoginRequired(page);
      if(!await authenticated(page,config,config.loginTimeoutMs)){
        signal?.throwIfAborted();
        throw new AuthRequiredError('Login was cancelled, timed out, or did not reach the authenticated page. No new state was saved.');
      }
    }
    signal?.throwIfAborted();
    await saveAuthState(context,config.statePath);
    return {context,page,reused,mode:config.mode,close,save:async()=>{
      if(!await authenticated(page,config,config.checkTimeoutMs))throw new AuthRequiredError();
      await saveAuthState(context,config.statePath);
    }};
  }catch(error){await close();signal?.throwIfAborted();throw error;}
}
