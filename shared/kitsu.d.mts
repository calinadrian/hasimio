import type {Meta} from '../src/media';
export const kitsuApi: string;
export type KitsuMeta = Meta & {aliases:string[]};
export function animeMeta(record:unknown): KitsuMeta;
export function kitsuCatalog(catalog:string, query?:string, skip?:number, signal?:AbortSignal, fetchImpl?:typeof fetch):Promise<{metas:KitsuMeta[];hasMore:boolean}>;
export function kitsuMetadata(id:string,signal?:AbortSignal,fetchImpl?:typeof fetch,episodeNumber?:number):Promise<KitsuMeta>;
