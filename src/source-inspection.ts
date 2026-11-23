import {isWebOS} from './webos/platform';
import {useEffect,useRef,useState} from 'react';
import {INSPECTION_CONCURRENCY} from '../shared/inspection-policy.mjs';
import {engineUrl} from './engine';
import type {Stream} from './media';
import {saveTrackSummary,trackSourceKey,verifiedTracks,type MediaTrack} from './playback-tracks';

export const deviceTrackChecks=isWebOS||import.meta.env.VITE_ANDROID==='true';
export const inspectionWorkers=deviceTrackChecks?1:INSPECTION_CONCURRENCY;
// The engine itself could not be reached: every other check would fail the same way.
export class EngineUnreachableError extends Error{}
export async function inspectStreamTracks(stream:Stream,videoId:string,signal:AbortSignal){
  if(!stream.infoHash)return;
  // A dropped connection surfaces as the browser's bare "Failed to fetch"; say what actually failed.
  let response:Response;
  try{
    response=await fetch(engineUrl('/api/torrent-inspections'),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({infoHash:stream.infoHash,fileIdx:stream.fileIdx,videoId}),signal,
    });
  }catch(error){if(signal.aborted)throw error;throw new EngineUnreachableError('Couldn’t reach Hasimio Engine.');}
  const info=await response.json().catch(()=>({error:'Hasimio Engine sent an unreadable answer.'}));
  if(!response.ok)throw Error(info.error||'Track inspection failed.');
  if(!Array.isArray(info.audioTracks)||!Array.isArray(info.subtitleTracks)||!Number.isInteger(info.fileIndex))throw Error('Track information was incomplete.');
  if(stream.fileIdx!==undefined&&stream.fileIdx!==info.fileIndex)throw Error('The checked file differs from this source’s advertised file.');
  if(!signal.aborted)saveTrackSummary(stream.infoHash,videoId,info.audioTracks as MediaTrack[],info.subtitleTracks as MediaTrack[],stream.fileIdx,info.fileIndex);
}

export function useQuickTrackInspection(videoId:string,active:boolean,streams:Stream[]){
  const work=useRef<{controller:AbortController;started:Set<string>;pending:Set<string>}|undefined>(undefined);
  const [,update]=useState(0);
  const candidates=active?streams.filter(stream=>stream.infoHash&&!verifiedTracks(stream,videoId)):[];
  useEffect(()=>{
    if(!active)return;
    const next={controller:new AbortController(),started:new Set<string>(),pending:new Set<string>()};
    work.current=next;
    return()=>{next.controller.abort();work.current=undefined;};
  },[videoId,active]);
  useEffect(()=>{
    const job=work.current;
    if(!active||!job)return;
    for(const stream of candidates){
      if(job.pending.size>=inspectionWorkers||job.started.size>=INSPECTION_CONCURRENCY)break;
      const key=trackSourceKey(stream,videoId);
      if(job.started.has(key))continue;
      job.started.add(key);
      job.pending.add(key);
      void inspectStreamTracks(stream,videoId,job.controller.signal).catch(()=>{/* Quick Play uses the best evidence available. */}).finally(()=>{
        job.pending.delete(key);
        if(!job.controller.signal.aborted)update(value=>value+1);
      });
    }
  });
  return active&&(!!work.current?.pending.size||
    ((work.current?.started.size??0)<INSPECTION_CONCURRENCY&&candidates.some(stream=>!work.current?.started.has(trackSourceKey(stream,videoId)))));
}
