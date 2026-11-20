import {expect,it} from 'vitest';
import {nativeLanguages,rememberedTrack} from './NativeTracks';
const header=['eng','ron'].map((language,index)=>({index,language,title:['Original','Dub'][index],default:false,codec:'aac'}));
it('fills missing native language tags and respects conflicting device ordering',()=>{
  const tracks=[{index:0,label:'',language:''},{index:1,label:'',language:'und'}];
  expect(nativeLanguages(tracks,header).map(track=>track.language)).toEqual(['eng','ron']);
  expect(nativeLanguages([{...tracks[0],label:'Dub'}],header)[0].language).toBe('ron');
  expect(nativeLanguages([tracks[0]],header)[0].language).toBe('');
  expect(nativeLanguages([{...tracks[0],language:'ron'},tracks[1]],header)[1].language).toBe('und');
});

it('keeps a manual selection when delayed track headers supply its language',()=>{
  const choice={index:1,label:'',language:''};
  const other={...choice,index:0};
  const selected={...choice,language:'ron'};
  expect(rememberedTrack([other,selected],choice)).toBe(selected);
  expect(rememberedTrack([other,selected],{...choice,language:'en'})).toBeUndefined();
  expect(rememberedTrack([selected],{...choice,index:4,language:'ro'})).toBe(selected);
});
