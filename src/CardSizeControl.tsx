import {CARD_SIZES,setCardSize,type CardSize} from './card-size';

/** Three poster tiles of growing size, so the choice reads without words. */
function SizeIcon({size}:{size:CardSize}){
  const tiles=size==='small'?[[1,3,4,6],[7,3,4,6],[13,3,4,6]]:size==='medium'?[[2,2,5,8],[11,2,5,8]]:[[5,1,8,12]];
  return <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">{tiles.map(([x,y,width,height])=><rect key={x} x={x} y={y} width={width} height={height} rx="1.2" fill="currentColor"/>)}</svg>;
}

export default function CardSizeControl({value}:{value:CardSize}){
  return <div className="card-size" role="group" aria-label="Card size">
    {CARD_SIZES.map(size=><button key={size.value} type="button" aria-pressed={value===size.value} aria-label={size.label} title={size.label} onClick={()=>setCardSize(size.value)}><SizeIcon size={size.value}/></button>)}
  </div>;
}
