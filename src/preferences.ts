export const settingsKey='hasimio:settings';
export const captionFonts={sans:{label:'Modern sans',family:"'DM Sans',system-ui,sans-serif"},display:{label:'Bold display',family:"Manrope,'DM Sans',sans-serif"},rounded:{label:'Rounded',family:"ui-rounded,'SF Pro Rounded','Nunito','Arial Rounded MT Bold',system-ui,sans-serif"},serif:{label:'Serif',family:"Georgia,'Times New Roman',serif"},mono:{label:'Typewriter',family:"ui-monospace,Consolas,'Courier New',monospace"}} as const;
export const captionEdges={none:'None',shadow:'Drop shadow',soft:'Soft glow',outline:'Outline',raised:'Raised',depressed:'Depressed'} as const;
export type CaptionFont=keyof typeof captionFonts;export type CaptionEdge=keyof typeof captionEdges;
export type CaptionStyle={captionFont:CaptionFont;captionColor:string;captionBackground:number;captionEdge:CaptionEdge;captionBold:boolean};
// Each preset is a full style; adjusting any field afterwards shows the style as Custom.
export const captionPresets:{id:string;label:string;style:CaptionStyle}[]=[
  {id:'cinema',label:'Cinema',style:{captionFont:'sans',captionColor:'#ffffff',captionBackground:0,captionEdge:'soft',captionBold:true}},
  {id:'classic',label:'Classic box',style:{captionFont:'sans',captionColor:'#ffffff',captionBackground:75,captionEdge:'none',captionBold:false}},
  {id:'outline',label:'Bold outline',style:{captionFont:'display',captionColor:'#ffffff',captionBackground:0,captionEdge:'outline',captionBold:true}},
  {id:'yellow',label:'Yellow',style:{captionFont:'sans',captionColor:'#ffe14d',captionBackground:0,captionEdge:'outline',captionBold:true}},
  {id:'soft',label:'Soft box',style:{captionFont:'rounded',captionColor:'#f5f5f5',captionBackground:45,captionEdge:'none',captionBold:false}},
  {id:'contrast',label:'High contrast',style:{captionFont:'display',captionColor:'#ffffff',captionBackground:100,captionEdge:'none',captionBold:true}},
  {id:'film',label:'Film serif',style:{captionFont:'serif',captionColor:'#fff8e7',captionBackground:0,captionEdge:'shadow',captionBold:false}},
];
export const captionColors=['#ffffff','#fff8e7','#ffe14d','#7fe3ff','#a8ff9e','#ffb3c7'];
export type PlayerSettings={volume:number;muted:boolean;rate:number;captionSize:number;captionDelay:number;captionPosition:number;subtitleLanguage:string;autoSubtitles:boolean}&CaptionStyle;
export const defaultSettings:PlayerSettings={volume:0.8,muted:false,rate:1,captionSize:100,captionDelay:0,captionPosition:8,subtitleLanguage:'eng',autoSubtitles:false,...captionPresets[0].style};
export function validSetting(key:string,value:unknown){
  if(key==='muted'||key==='captionBold'||key==='autoSubtitles')return typeof value==='boolean';
  if(key==='captionFont')return typeof value==='string'&&Object.hasOwn(captionFonts,value);
  if(key==='captionEdge')return typeof value==='string'&&Object.hasOwn(captionEdges,value);
  if(key==='captionColor')return typeof value==='string'&&/^#[\da-f]{6}$/i.test(value);
  if(key==='subtitleLanguage')return typeof value==='string'&&/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(value);
  return typeof value==='number'&&Number.isFinite(value)&&(key==='volume'?value>=0&&value<=1:key==='rate'?value>=0.25&&value<=3:key==='captionSize'?value>=50&&value<=200:key==='captionDelay'?value>=-120&&value<=120:key==='captionPosition'?value>=0&&value<=40:key==='captionBackground'?value>=0&&value<=100:false);
}
export function playerSettings():PlayerSettings{try{const data=JSON.parse(localStorage.getItem(settingsKey)??'{}');return {...defaultSettings,...Object.fromEntries(Object.entries(data).filter(([key,value])=>validSetting(key,value)))};}catch{return {...defaultSettings};}}
export function savePlayerSettings(settings:PlayerSettings){try{const text=JSON.stringify(settings);if(localStorage.getItem(settingsKey)===text)return;localStorage.setItem(settingsKey,text);window.dispatchEvent(new Event('hasimio:local-data'));}catch{/* Playback continues with session settings. */}}
