export type Quality='720p'|'1080p'|'2K'|'4K'|'SD'|'Other';
export const QUALITY_ORDER:Quality[];
export function detectQuality(value?:string):Quality;
export function detectCodec(value?:string):string|undefined;
export function detectRelease(value?:string):string|undefined;
/** Size in bytes: the size stated on the title's later lines first, then anywhere in `text`. */
export function parseSize(title?:string,text?:string):number|undefined;
