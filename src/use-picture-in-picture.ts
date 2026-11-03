import {useEffect,useState,type RefObject} from 'react';

type DesktopPip={setPictureInPicture?:(enabled:boolean)=>Promise<boolean>;onPictureInPicture?:(listener:(enabled:boolean)=>void)=>()=>void};
const desktop=(globalThis as {hasimioDesktop?:DesktopPip}).hasimioDesktop;

export function usePictureInPicture(video:RefObject<HTMLVideoElement|null>){
  const [active,setActive]=useState(false);
  useEffect(()=>{
    const update=(enabled:boolean)=>{document.body.classList.toggle('hasimio-pip',enabled);setActive(enabled);};
    const stop=desktop?.onPictureInPicture?.(update);
    const element=video.current;
    const enter=()=>setActive(true),leave=()=>setActive(false);
    element?.addEventListener('enterpictureinpicture',enter);
    element?.addEventListener('leavepictureinpicture',leave);
    return()=>{
      stop?.();document.body.classList.remove('hasimio-pip');
      element?.removeEventListener('enterpictureinpicture',enter);element?.removeEventListener('leavepictureinpicture',leave);
      if(desktop?.setPictureInPicture)void desktop.setPictureInPicture(false).catch(()=>{});
      else if(document.pictureInPictureElement===element)void document.exitPictureInPicture().catch(()=>{});
    };
  },[video]);
  async function toggle(){
    if(desktop?.setPictureInPicture){
      const enabled=await desktop.setPictureInPicture(!active);
      document.body.classList.toggle('hasimio-pip',enabled);setActive(enabled);
    }else if(document.pictureInPictureElement)await document.exitPictureInPicture();
    else if(video.current)await video.current.requestPictureInPicture();
  }
  return {active,toggle,available:!!desktop?.setPictureInPicture||document.pictureInPictureEnabled};
}
