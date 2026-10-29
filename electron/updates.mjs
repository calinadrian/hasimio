// App updates from GitHub releases (electron-updater). Kept apart from Electron so the event order and retries are testable.

const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',mdash:'—',ndash:'–',hellip:'…'};
function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(match,entity)=>{
    if(entity[0]==='#')return String.fromCodePoint(entity[1]==='x'||entity[1]==='X'?parseInt(entity.slice(2),16):Number(entity.slice(1)));
    return ENTITIES[entity.toLowerCase()]??match;
  });
}
/** GitHub sends release notes as HTML; turn them (or markdown) into titled lists for the update panel. */
export function releaseSections(raw) {
  let text=Array.isArray(raw)?raw.map(item=>item.note??'').join('\n'):(raw??'');
  if(/<[a-z]/i.test(text)){
    text=text.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,'').replace(/<h\d\b[^>]*>([\s\S]*?)<\/h\d>/gi,(_,t)=>`\n## ${t}\n`).replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi,(_,t)=>`\n- ${t}\n`).replace(/<br\s*\/?>|<\/p>/gi,'\n').replace(/<[^>]+>/g,'');
    text=decode(text);
  }
  const sections=[];
  for(const line of text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean)){
    const heading=/^#+\s*(.+)/.exec(line),entry=/^[-*•]\s*(.+)/.exec(line);
    if(heading)sections.push({title:heading[1],items:[]});
    else {if(!sections.length)sections.push({title:'',items:[]});sections[sections.length-1].items.push(entry?entry[1]:line);}
  }
  return sections.filter(s=>s.items.length);
}

/**
 * Installed copies download new releases in the background and install when the user restarts from the
 * update panel, or when Hasimio quits. Development runs (status 'dev') never update.
 */
export function createUpdates({current,updater,publish=()=>undefined,beforeInstall=()=>undefined}) {
  let state={current,status:updater?'idle':'dev'},downloaded,pending=false;
  const set=patch=>{state={...state,...patch};publish(state);};
  // A downloaded update stays ready to install while later checks look for an even newer release.
  const keepReady=()=>{set({status:'ready',percent:100,version:downloaded.version,notes:downloaded.notes,checkedAt:Date.now(),message:undefined});};
  const fail=error=>{pending=false;if(downloaded)keepReady();else failed(error);};
  const failed=error=>
    // Before the first release GitHub has nothing to offer, which just means this is the latest version.
    /No published versions/i.test(error.message)
      ?set({status:'latest',checkedAt:Date.now(),version:undefined,notes:[],message:undefined})
      :set({status:'error',checkedAt:Date.now(),message:/net::|ENOTFOUND|ETIMEDOUT|ECONN|EAI_AGAIN/i.test(error.message)?'No connection to GitHub. Check your connection and try again.':'The update failed. Check for updates to try again.'});
  if(updater){
    updater.autoDownload=true;updater.autoInstallOnAppQuit=true;updater.autoRunAppAfterInstall=true;
    updater.on('checking-for-update',()=>{if(!downloaded)set({status:'checking',message:undefined});});
    updater.on('update-not-available',()=>{pending=false;if(downloaded)keepReady();else set({status:'latest',checkedAt:Date.now(),version:undefined,notes:[]});});
    updater.on('update-available',info=>{pending=false;set({status:'downloading',percent:0,version:info.version,notes:releaseSections(info.releaseNotes),checkedAt:Date.now()});});
    updater.on('download-progress',p=>set({status:'downloading',percent:Math.max(0,Math.min(100,Math.round(p.percent)||0))}));
    updater.on('update-downloaded',info=>{downloaded={version:info.version,notes:info.releaseNotes==null?state.notes:releaseSections(info.releaseNotes)};keepReady();});
    updater.on('error',fail);
  }
  return {
    get:()=>state,
    check(){
      if(!updater||pending||['checking','downloading','installing'].includes(state.status))return state;
      pending=true;
      if(!downloaded)set({status:'checking',message:undefined});
      // Also handle synchronous failures and rejected checks that don't emit an error event.
      Promise.resolve().then(()=>updater.checkForUpdates()).then(()=>{pending=false;},fail);
      return state;
    },
    install(){
      if(!updater||state.status!=='ready')return;
      set({status:'installing'});
      try {beforeInstall();updater.quitAndInstall(true,true);}catch(error){fail(error);}
    },
  };
}
