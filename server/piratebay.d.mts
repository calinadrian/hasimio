import type {Stream,Manifest} from '../src/media';
export const pirateBayManifest:Manifest;
export function validHash(value:unknown):boolean;
export function parseVideoId(type:string,id:string):{imdb?:string;kitsu?:string;season?:number;episode?:number};
export function sizeLabel(size:string|number):string;
export function torrentResults(rows:unknown,imdb?:string):Stream[];
export function searchPirateBay(type:string,id:string,fetchImpl?:typeof fetch,lookupTitle?:(imdb:string)=>Promise<{name:string;start?:number|null}>):Promise<{streams:Stream[]}>;
