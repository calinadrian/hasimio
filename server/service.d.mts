import type {IncomingMessage,ServerResponse} from 'node:http';
export function createMediaService(options?:{clientFactory?:()=>unknown;inspectionClientFactory?:()=>unknown;allowedOrigins?:Set<string>}): {handle:(req:IncomingMessage,res:ServerResponse,next?:()=>void)=>Promise<void>;close:()=>Promise<void>};
