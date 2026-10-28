import type {Stream,Manifest} from '../src/media';
export const ytsManifest:Manifest;
export const YTS_API:string;
export function ytsResults(payload:unknown,imdb:string):Stream[];
export function searchYts(type:string,id:string,fetchImpl?:typeof fetch):Promise<{streams:Stream[]}>;
