// Remote-control spatial navigation: choose the control an arrow key moves to.
export type Box={left:number;top:number;width:number;height:number};
export type Direction='ArrowUp'|'ArrowDown'|'ArrowLeft'|'ArrowRight';
export type Candidate<T>={item:T;box:Box;slider?:boolean};

function overlap(a0:number,a1:number,b0:number,b1:number){return Math.min(a1,b1)-Math.max(a0,b0);}

/**
 * Left/Right stay on the current row. Only when `crossRows` is set (leaving
 * the sidebar for the page) may they land on another row if nothing on this
 * row lies in that direction. A slider is never entered sideways, so a
 * full-width timeline above a button row cannot catch Left/Right and turn the
 * next press into a seek. Up/Down reach it normally.
 */
export function pickTarget<T>(origin:Box,direction:Direction,candidates:readonly Candidate<T>[],crossRows=false):T|undefined{
  const horizontal=direction==='ArrowLeft'||direction==='ArrowRight';
  const positive=direction==='ArrowRight'||direction==='ArrowDown';
  const x=origin.left+origin.width/2,y=origin.top+origin.height/2;
  let best:{item:T;score:number}|undefined,bestOnRow:{item:T;score:number}|undefined;
  for(const candidate of candidates){
    const box=candidate.box;
    const dx=box.left+box.width/2-x,dy=box.top+box.height/2-y;
    // Sideways distance is measured edge to edge: a full-width timeline
    // directly above a button counts as aligned with it, even though its
    // centre is far away.
    const side=horizontal
      ?Math.max(0,-overlap(box.top,box.top+box.height,origin.top,origin.top+origin.height))
      :Math.max(0,-overlap(box.left,box.left+box.width,origin.left,origin.left+origin.width));
    const forward=(horizontal?dx:dy)*(positive?1:-1);
    if(forward<=4)continue;
    if(horizontal&&candidate.slider)continue;
    const score=forward+side*3;
    if(!best||score<best.score)best={item:candidate.item,score};
    if(horizontal){
      const shared=overlap(box.top,box.top+box.height,origin.top,origin.top+origin.height);
      if(shared>Math.min(box.height,origin.height)/3&&(!bestOnRow||score<bestOnRow.score))bestOnRow={item:candidate.item,score};
    }
  }
  return horizontal?(bestOnRow??(crossRows?best:undefined))?.item:best?.item;
}
