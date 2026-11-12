const controls='button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]';
const directions:Record<string,[number,number]>={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};

document.addEventListener('keydown',event=>{
  const direction=directions[event.key];
  if(!direction||event.altKey||event.ctrlKey||event.metaKey||document.fullscreenElement)return;
  const active=document.activeElement;
  if(active?.matches('input, textarea, select, [contenteditable="true"]'))return;
  const scope=document.querySelector('.live-tv-expanded, .cinema-menu')??document.querySelector('.cinema-player, dialog[open]')??document;
  const sidebar=active?.closest('.sidebar');
  const [xDirection,yDirection]=direction;
  const list=Array.from((sidebar&&yDirection&&scope.contains(sidebar)?sidebar:scope).querySelectorAll<HTMLElement>(controls)).filter(element=>
    element.tabIndex>=0&&element.getClientRects().length>0&&getComputedStyle(element).visibility==='visible'&&
    !element.closest('[hidden], [inert], [aria-hidden="true"]')&&
    !(yDirection>0&&!active?.closest('.search')&&element.closest('.search'))
  );
  if(!list.length)return;
  event.preventDefault();
  event.stopPropagation();
  if(!(active instanceof HTMLElement)||!scope.contains(active)||active===document.body){
    const first=list.find(element=>element.matches('nav button.active'))??list[0];
    first.focus();
    return;
  }
  const origin=active.getBoundingClientRect();
  let next:HTMLElement|undefined,best=Infinity;
  for(const element of list){
    if(element===active)continue;
    const rect=element.getBoundingClientRect();
    const dx=rect.left+rect.width/2-origin.left-origin.width/2;
    const dy=rect.top+rect.height/2-origin.top-origin.height/2;
    const forward=dx*xDirection+dy*yDirection;
    if(forward<=4)continue;
    const score=forward+3*Math.abs(dx*yDirection+dy*xDirection);
    if(score<best){best=score;next=element;}
  }
  next?.focus({preventScroll:true});
  next?.scrollIntoView({block:'nearest',inline:'nearest'});
},true);
export {};
