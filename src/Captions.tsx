import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Check,Globe,LoaderCircle,RotateCcw} from 'lucide-react';
import {captionColors,captionEdges,captionFonts,captionPresets,defaultSettings,type CaptionEdge,type CaptionFont,type CaptionStyle,type PlayerSettings} from './preferences';
import {captionLines,languageName,parseVtt,sameLanguage,srtToVtt} from './playback-tracks';
import {engineUrl} from './engine';

export type CaptionSettings=Pick<PlayerSettings,'captionSize'|'captionDelay'|'captionPosition'|'subtitleLanguage'|'autoSubtitles'>&CaptionStyle;
export type SubtitleFile={url:string;label:string;language:string};
export type Frame={left:number;top:number;width:number;height:number};

const edges:Record<CaptionEdge,CSSProperties>={
  none:{},
  shadow:{textShadow:'.05em .06em .1em rgba(0,0,0,.95),0 0 .3em rgba(0,0,0,.35)'},
  soft:{textShadow:'0 0 .08em rgba(0,0,0,.95),0 .03em .14em rgba(0,0,0,.9),0 0 .45em rgba(0,0,0,.55)'},
  outline:{WebkitTextStroke:'.09em #000',paintOrder:'stroke fill',textShadow:'0 .04em .14em rgba(0,0,0,.75)'},
  raised:{textShadow:'-.03em -.03em 0 rgba(255,255,255,.3),.04em .05em 0 #000,.06em .08em .1em rgba(0,0,0,.8)'},
  depressed:{textShadow:'.03em .03em 0 rgba(255,255,255,.3),-.04em -.05em 0 #000,0 0 .2em rgba(0,0,0,.6)'},
};
// Subtitles are sized from the visible picture, so they shrink and grow with the player.
export function captionFontSize(frame:Frame,size:number){return Math.max(12,Math.min(frame.height*0.047,frame.width*0.034)*size/100);}
export function textStyle(style:CaptionStyle):CSSProperties{return {fontFamily:captionFonts[style.captionFont].family,color:style.captionColor,fontWeight:style.captionBold?650:500,...edges[style.captionEdge]};}
export function boxStyle(style:CaptionStyle):CSSProperties{return {background:style.captionBackground?`rgba(8,8,8,${style.captionBackground/100})`:'transparent'};}
export function matchingPreset(style:CaptionStyle){return captionPresets.find(preset=>(Object.keys(preset.style) as (keyof CaptionStyle)[]).every(key=>preset.style[key]===style[key]))?.id;}
export function subtitleFile(text:string,label:string,language:string):SubtitleFile{
  const vtt=(/^\s*(?:﻿)?WEBVTT/.test(text)?text:srtToVtt(text)).trimEnd()+'\n\n';
  if(!parseVtt(vtt).length)throw new Error('No timed subtitles were found. Use a UTF-8 SRT / VTT file.');
  return {url:URL.createObjectURL(new Blob([vtt],{type:'text/vtt'})),label,language};
}

export function CaptionOverlay({cues,settings,frame,lift,preview}:{cues:string[];settings:CaptionSettings;frame?:Frame;lift:{top:number;bottom:number};preview:boolean}){
  if(!frame||frame.height<=0)return null;
  const parsed=cues.map(captionLines).filter(cue=>cue.lines.length),shown=parsed.length?parsed:preview?[{top:false,lines:[[{text:'Subtitles will look like this.'}],[{text:'Adjust them to your liking.',italic:true}]]}]:[];
  if(!shown.length)return null;
  const gap=frame.height*settings.captionPosition/100;
  const group=(top:boolean)=>{const items=shown.filter(cue=>cue.top===top);if(!items.length)return null;
    return <div className={`cinema-caption-group ${top?'top':'bottom'}`} style={top?{top:Math.max(gap,lift.top)}:{bottom:Math.max(gap,lift.bottom)}}>{items.map((cue,index)=><p key={index} className="cinema-caption" style={boxStyle(settings)}>{cue.lines.map((line,row)=><span key={row} className="cinema-caption-line">{line.map((part,n)=><span key={n} style={{fontStyle:part.italic?'italic':undefined,fontWeight:part.bold?750:undefined,textDecoration:part.underline?'underline':undefined}}>{part.text}</span>)}</span>)}</p>)}</div>;};
  return <div className={`cinema-captions ${parsed.length?'':'is-preview'}`} aria-hidden={!parsed.length} style={{left:frame.left,top:frame.top,width:frame.width,height:frame.height,fontSize:captionFontSize(frame,settings.captionSize),...textStyle(settings)}}>{group(true)}{group(false)}</div>;
}

export function CaptionStyleControls({settings,onChange}:{settings:CaptionSettings;onChange:(next:Partial<CaptionSettings>)=>void}){
  const active=matchingPreset(settings);
  return <div className="caption-style">
    <div className="caption-section-heading"><h4>Style</h4><span>{active?captionPresets.find(preset=>preset.id===active)?.label:'Custom'}</span></div>
    <div className="caption-presets" role="radiogroup" aria-label="Subtitle style">{captionPresets.map(preset=><button key={preset.id} type="button" role="radio" aria-checked={active===preset.id} className={`caption-preset ${active===preset.id?'selected':''}`} onClick={()=>onChange(preset.style)}><span className="caption-preset-sample"><span style={{...textStyle(preset.style),...boxStyle(preset.style)}}>Aa</span></span><span className="caption-preset-label">{preset.label}</span>{active===preset.id&&<Check size={14} className="caption-preset-check"/>}</button>)}</div>
    <label className="cinema-field caption-range">Size<span className="caption-range-row"><input type="range" min={50} max={200} step={5} value={settings.captionSize} onChange={event=>onChange({captionSize:Number(event.target.value)})}/><output>{settings.captionSize}%</output></span></label>
    <label className="cinema-field caption-range">Distance from bottom<span className="caption-range-row"><input type="range" min={0} max={40} step={1} value={settings.captionPosition} onChange={event=>onChange({captionPosition:Number(event.target.value)})}/><output>{settings.captionPosition}%</output></span></label>
    <details className="caption-customize"><summary>Customize style</summary>
      <label className="cinema-field">Font<select value={settings.captionFont} onChange={event=>onChange({captionFont:event.target.value as CaptionFont})}>{Object.entries(captionFonts).map(([id,font])=><option key={id} value={id}>{font.label}</option>)}</select></label>
      <div className="cinema-field"><span id="caption-color-label">Text color</span><div className="caption-colors" role="radiogroup" aria-labelledby="caption-color-label">{captionColors.map(color=><button key={color} type="button" role="radio" aria-checked={settings.captionColor===color} aria-label={color} className={settings.captionColor===color?'selected':''} style={{background:color}} onClick={()=>onChange({captionColor:color})}/>)}<label className="caption-color-custom" title="Custom color"><input type="color" aria-label="Custom text color" value={settings.captionColor} onChange={event=>onChange({captionColor:event.target.value})}/></label></div></div>
      <label className="cinema-field">Edge<select value={settings.captionEdge} onChange={event=>onChange({captionEdge:event.target.value as CaptionEdge})}>{Object.entries(captionEdges).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <label className="cinema-field caption-range">Background<span className="caption-range-row"><input type="range" min={0} max={100} step={5} value={settings.captionBackground} onChange={event=>onChange({captionBackground:Number(event.target.value)})}/><output>{settings.captionBackground?`${settings.captionBackground}%`:'Off'}</output></span></label>
      <label className="caption-toggle"><input type="checkbox" checked={settings.captionBold} onChange={event=>onChange({captionBold:event.target.checked})}/>Bold text</label>
    </details>
    <label className="cinema-field">Subtitle delay (seconds)<input type="number" min={-30} max={30} step={0.1} value={settings.captionDelay} onChange={event=>onChange({captionDelay:Math.max(-30,Math.min(30,Math.round((Number(event.target.value)||0)*10)/10))})}/></label>
    <p className="cinema-help">Negative shows subtitles earlier; positive shows them later.</p>
    <button type="button" className="cinema-text-action caption-reset" onClick={()=>onChange({captionSize:defaultSettings.captionSize,captionPosition:defaultSettings.captionPosition,captionDelay:0,...captionPresets[0].style})}><RotateCcw size={14}/> Reset subtitle style</button>
  </div>;
}

type OnlineResult={id:string;language:string;release:string;match:number};
export type OnlineSearch={state:'idle'|'loading'|'ready'|'error'|'unsupported';results:OnlineResult[];error?:string};
export function onlineSupported(videoId?:string){return !!videoId&&/^tt\d+(?::\d+:\d+)?$/.test(videoId);}
// One search per video, shared by the subtitles panel and automatic loading.
export function useOnlineSubtitles(videoId:string|undefined,filename:string|undefined,wanted:boolean){
  const [search,setSearch]=useState<OnlineSearch>({state:onlineSupported(videoId)?'idle':'unsupported',results:[]}),[attempt,setAttempt]=useState(0),started=useRef('');
  const key=`${videoId}|${filename}|${attempt}`;
  useEffect(()=>{setSearch({state:onlineSupported(videoId)?'idle':'unsupported',results:[]});},[videoId,filename]);
  useEffect(()=>{
    if(!wanted||!onlineSupported(videoId)||started.current===key)return;
    started.current=key;let done=false;
    const controller=new AbortController();setSearch({state:'loading',results:[]});
    fetch(engineUrl(`/api/subtitles/search?id=${encodeURIComponent(videoId!)}&filename=${encodeURIComponent(filename||'')}`),{signal:controller.signal}).then(async response=>{
      const body=response.headers.get('content-type')?.includes('application/json')?await response.json():undefined;
      if(!body)throw new Error('Online subtitles need Hasimio Engine running on this PC.');
      if(!response.ok)throw new Error(body.error||'Online subtitles are unavailable.');
      setSearch({state:'ready',results:Array.isArray(body.subtitles)?body.subtitles:[]});
    }).catch(e=>{if(!controller.signal.aborted)setSearch({state:'error',results:[],error:e instanceof Error?e.message:'Online subtitles are unavailable.'});}).finally(()=>{done=true;});
    // Closing the panel mid-search cancels it; the next open searches again.
    return()=>{if(!done){controller.abort();started.current='';setSearch(previous=>previous.state==='loading'?{state:'idle',results:[]}:previous);}};
  },[wanted,key]);
  return {search,retry:()=>setAttempt(n=>n+1)};
}
export function bestOnline(results:OnlineResult[],language:string){return results.find(item=>sameLanguage(item.language,language));}
export async function loadOnlineSubtitle(item:OnlineResult){
  let response;try{response=await fetch(engineUrl(`/api/subtitles/files/${item.id}`));}catch{throw new Error('Online subtitles need Hasimio Engine running on this PC.');}
  if(!response.ok){const body=await response.json().catch(()=>undefined);throw new Error(body?.error||'This subtitle could not be downloaded. Try another one.');}
  return subtitleFile(await response.text(),`OpenSubtitles · ${languageName(item.language)}`,item.language);
}

export function OnlineSubtitles({search,retry,language,active,auto,onAuto,onLanguage,onLoad,onOff}:{search:OnlineSearch;retry:()=>void;language:string;active?:SubtitleFile&{online?:string};auto:boolean;onAuto:(auto:boolean)=>void;onLanguage:(language:string)=>void;onLoad:(file:SubtitleFile&{online:string})=>void;onOff:()=>void}){
  const languages=[...new Set([language,...search.results.map(item=>item.language)])].map(code=>({code,name:languageName(code),count:search.results.filter(item=>sameLanguage(item.language,code)).length})).sort((a,b)=>a.code===language?-1:b.code===language?1:a.name.localeCompare(b.name));
  const options=search.results.filter(item=>sameLanguage(item.language,language)).slice(0,40);
  const [choice,setChoice]=useState<string>(),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const selected=options.find(item=>item.id===choice)??options[0];
  async function load(){if(!selected)return;setLoading(true);setError('');try{onLoad({...await loadOnlineSubtitle(selected),online:selected.id});}catch(e){setError(e instanceof Error?e.message:'This subtitle could not be downloaded.');}finally{setLoading(false);}}
  return <div className="caption-online">
    <div className="caption-section-heading"><h4><Globe size={15}/> Online subtitles</h4><span>OpenSubtitles</span></div>
    {active?.online&&<div className="caption-online-current"><span>{active.label}</span><button type="button" className="cinema-text-action" onClick={onOff}>Turn off</button></div>}
    {search.state==='unsupported'?<p className="cinema-help">Online subtitles are available for movies and series with an IMDb listing. Load an SRT / VTT file instead.</p>
    :search.state==='loading'||search.state==='idle'?<p className="cinema-help caption-online-status"><LoaderCircle size={15} className="spin"/> Searching for subtitles…</p>
    :search.state==='error'?<div className="caption-online-status" role="alert"><p className="cinema-help">{search.error}</p><button type="button" className="cinema-text-action" onClick={retry}>Search again</button></div>
    :<>
      <label className="cinema-field">Language<select value={language} onChange={event=>{onLanguage(event.target.value);setChoice(undefined);}}>{languages.map(item=><option key={item.code} value={item.code}>{item.name} ({item.count})</option>)}</select></label>
      {options.length?<><label className="cinema-field">Version<select value={selected?.id} onChange={event=>setChoice(event.target.value)}>{options.map((item,index)=><option key={item.id} value={item.id}>{index===0&&item.match>=0.5?'★ Best match · ':''}{item.release}</option>)}</select></label>
        {active?.online===selected?.id?<p className="caption-online-active"><Check size={15}/> Showing this version</p>:<button type="button" className="cinema-action caption-online-action" disabled={loading} onClick={()=>void load()}>{loading?<LoaderCircle size={17} className="spin"/>:<Check size={17}/>} {loading?'Loading…':active?.online?'Switch to this version':'Use these subtitles'}</button>}
        {selected&&selected.match<0.5&&<p className="cinema-help">Timing may differ from your video. Adjust the subtitle delay if lines appear early or late.</p>}
      </>:<p className="cinema-help">No {languageName(language)} subtitles were found. Choose another language.</p>}
      {error&&<p className="cinema-help" role="alert">{error}</p>}
      <label className="caption-toggle"><input type="checkbox" checked={auto} onChange={event=>onAuto(event.target.checked)}/>Load automatically when a video has no {languageName(language)} subtitles</label>
    </>}
  </div>;
}

