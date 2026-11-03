export const isWebOS = import.meta.env.VITE_WEBOS === 'true';
export const tvVideoBufferBytes = 16 * 1024 * 1024;
export const tvCatalogPageSize = 30;

export type PalmBridge = {onservicecallback:(response:string)=>void;call:(url:string,payload:string)=>void;cancel?:()=>void};
export function bridge():PalmBridge|undefined {
  const Constructor=(window as unknown as {PalmServiceBridge?:new()=>PalmBridge}).PalmServiceBridge;
  return Constructor?new Constructor():undefined;
}

export function mediaCommand(method:string,parameters:Record<string,unknown>):Promise<void>{
  return new Promise((resolve,reject)=>{
    const connection=bridge();
    if(!connection){reject(Error('Native TV controls are unavailable.'));return;}
    connection.onservicecallback=text=>{try{const result=JSON.parse(text);if(result.returnValue===false)reject(Error('The TV could not switch this track. Try another source.'));else resolve();}catch{reject(Error('The TV did not respond.'));}};
    connection.call('luna://com.webos.media/'+method,JSON.stringify(parameters));
  });
}
