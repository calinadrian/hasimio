export const settingsKey='hasimio:settings';
export type PlayerSettings={volume:number;muted:boolean;rate:number;captionSize:number;captionDelay:number};
export const defaultSettings:PlayerSettings={volume:0.8,muted:false,rate:1,captionSize:100,captionDelay:0};
export function validSetting(key:string,value:unknown){return key==='muted'?typeof value==='boolean':typeof value==='number'&&Number.isFinite(value)&&(key==='volume'?value>=0&&value<=1:key==='rate'?value>=0.25&&value<=3:key==='captionSize'?value>=50&&value<=200:key==='captionDelay'?value>=-120&&value<=120:false);}
export function playerSettings():PlayerSettings{try{const data=JSON.parse(localStorage.getItem(settingsKey)??'{}');return {...defaultSettings,...Object.fromEntries(Object.entries(data).filter(([key,value])=>validSetting(key,value)))};}catch{return {...defaultSettings};}}
export function savePlayerSettings(settings:PlayerSettings){try{const text=JSON.stringify(settings);if(localStorage.getItem(settingsKey)===text)return;localStorage.setItem(settingsKey,text);window.dispatchEvent(new Event('hasimio:local-data'));}catch{/* Playback continues with session settings. */}}
