import type {IncomingMessage,ServerResponse} from 'node:http';
export function createSyncRelay(options:{dataDir:string;publicUrl?:string;uiRoot?:string;now?:()=>number;trustProxy?:boolean;onError?:(error:Error)=>void}):{handle:(request:IncomingMessage,response:ServerResponse)=>Promise<unknown>;close:()=>Promise<unknown>};
