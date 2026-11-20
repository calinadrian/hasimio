import {describe,it,expect} from 'vitest';
import reader from './matroska-tracks.cjs';

function field(hex,...parts){
  const data=Buffer.concat(parts.map(part=>Buffer.isBuffer(part)?part:Buffer.from(part)));
  const size=data.length<127?[0x80+data.length]:[0x40+(data.length>>8),data.length&255];
  return Buffer.concat([Buffer.from(hex,'hex'),Buffer.from(size),data]);
}
const track=(type,codec,...extra)=>field('ae',field('83',[type]),field('86',codec),...extra);
const sample=Buffer.concat([
  field('1a45dfa3',field('4282','matroska')),
  Buffer.from('18538067ff','hex'),
  field('1654ae6b',
    track(2,'A_AAC',field('22b59c','eng')),
    track(2,'A_AAC',field('22b59c','rum'),field('22b59d','ro-RO')),
    track(2,'A_AC3',field('b9',[0])),
    track(17,'S_TEXT/UTF8',field('22b59c','ron')),
    track(17,'S_HDMV/PGS',field('22b59c','eng'))),
]);
describe('bounded TV track discovery',()=>{
  it('reads complete active track entries and identifies text and image captions',()=>{
    const found=reader.matroskaTracks(sample);
    expect(found.audioTracks.map(track=>track.language)).toEqual(['eng','ro-RO']);
    expect(found.subtitleTracks.map(track=>track.supported)).toEqual([true,false]);
  });
  it('keeps incomplete, invalid and out-of-window track lists unknown',()=>{
    for(let end=0;end<sample.length;end++)expect(reader.matroskaTracks(sample.subarray(0,end))).toBeUndefined();
    expect(reader.matroskaTracks(Buffer.alloc(64))).toBeUndefined();
    expect(reader.matroskaTracks(Buffer.concat([Buffer.alloc(reader.headerLimit),sample]))).toBeUndefined();
  });
});
