// Small deterministic contracts for the isolated SAM pilot.
export const WIDTH=320, HEIGHT=240;
export function fixture(){
  const rgb=new Uint8Array(WIDTH*HEIGHT*3),truth=new Uint8Array(WIDTH*HEIGHT);
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    const i=y*WIDTH+x,body=(x-160)**2/72**2+(y-120)**2/78**2<=1;
    const stripe=body&&x>145&&x<175;
    truth[i]=body?1:0;
    rgb.set(body?(stripe?[231,169,65]:[166,53,48]):[44+Math.floor(x/16),89+Math.floor(y/12),121],i*3);
  }
  return {rgb,truth};
}
export function selectMask(tensor,scores,x,y,width=WIDTH,height=HEIGHT){
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=width||y>=height)throw Error("invalid_point");
  const size=width*height,d=tensor?.dims;
  if(!Array.isArray(d)||d.length!==4||d[0]!==1||d[1]!==3||d[2]!==height||d[3]!==width||
     tensor.data?.length!==3*size||scores?.length!==3||tensor.type!=="bool")throw Error("unexpected_model_output");
  let best=null;
  for(let c=0;c<3;c++){
    if(!Number.isFinite(scores[c])||!tensor.data[c*size+y*width+x])continue;
    const bits=new Uint8Array(size);let count=0;
    for(let i=0;i<size;i++){bits[i]=tensor.data[c*size+i]?1:0;count+=bits[i];}
    if(count===0||count===size)continue;
    if(!best||scores[c]>best.score)best={bits,count,score:scores[c],channel:c};
  }
  if(!best)throw Error("no_valid_mask");
  return best;
}
export function intersectionOverUnion(bits,truth){
  if(bits.length!==truth.length)throw Error("dimension_mismatch");
  let union=0,intersection=0;
  for(let i=0;i<bits.length;i++){if(bits[i]||truth[i])union++;if(bits[i]&&truth[i])intersection++;}
  return union?intersection/union:0;
}
