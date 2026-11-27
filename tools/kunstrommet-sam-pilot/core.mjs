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
// Prompt coordinates are fixed synthetic user-like clicks, not a ground-truth mask.
export const BASELINE_POINTS=[[160,120,1]];
export const GUIDED_POINTS=[[160,120,1],[117,120,1],[203,120,1],[160,70,1],[160,170,1],[65,120,0],[255,120,0],[160,20,0],[160,220,0]];
// Fixed prompts mimic deliberate user clicks. Ground truth is for evaluation only.
export const CHALLENGES=Object.freeze([
 {id:"ring",label:"Motiv med hull",points:[[105,120,1],[215,120,1],[160,65,1],[160,175,1],[160,120,0],[55,120,0],[265,120,0]]},
 {id:"low-contrast",label:"Lav kontrast og tekstur",points:[[160,120,1],[120,120,1],[195,120,1],[160,75,1],[160,165,1],[65,120,0],[255,120,0],[160,22,0],[160,218,0]]},
 {id:"neighbor",label:"Konkurrerende nabomotiv",points:[[113,120,1],[82,120,1],[138,90,1],[115,160,1],[222,120,0],[175,120,0],[30,120,0],[113,24,0]]}
]);
export function challengeFixture(id){
 if(!CHALLENGES.some(x=>x.id===id))throw Error("unknown_fixture");
 const rgb=new Uint8Array(WIDTH*HEIGHT*3),truth=new Uint8Array(WIDTH*HEIGHT);
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
   const i=y*WIDTH+x,noise=((x*17+y*31+(x*y)%29)%13)-6;
   let body=false,color;
   if(id==="ring"){
     const d=(x-160)**2+(y-120)**2;
     body=d<=77**2&&d>=34**2;
     color=body?[205+noise,128+noise,62+noise]:[48+noise,94+noise,128+noise];
   }else if(id==="low-contrast"){
     body=(x-160)**2/70**2+(y-120)**2/72**2<=1;
     const shade=Math.round(10*Math.sin(x/11)+8*Math.cos(y/17))+noise;
     color=body?[126+shade,137+shade,124+shade]:[107+shade,121+shade,111+shade];
   }else{
     body=(x-113)**2/56**2+(y-120)**2/70**2<=1;
     const neighbor=(x-224)**2/56**2+(y-120)**2/68**2<=1;
     color=body?[173+noise,85+noise,67+noise]:neighbor?[166+noise,98+noise,70+noise]:[55+noise,100+noise,130+noise];
   }
   truth[i]=body?1:0;rgb.set(color,i*3);
 }
 return {rgb,truth};
}
export function maskCandidates(tensor,scores,points,width=WIDTH,height=HEIGHT){
  if(!Array.isArray(points)||!points.length||!points.some(p=>p[2]===1)||points.some(p=>!Array.isArray(p)||p.length!==3||
    !Number.isInteger(p[0])||!Number.isInteger(p[1])||p[0]<0||p[1]<0||p[0]>=width||p[1]>=height||![0,1].includes(p[2])))throw Error("invalid_point");
  const size=width*height,d=tensor?.dims;
  if(!Array.isArray(d)||d.length!==4||d[0]!==1||d[1]!==3||d[2]!==height||d[3]!==width||
     tensor.data?.length!==3*size||scores?.length!==3||tensor.type!=="bool")throw Error("unexpected_model_output");
  return Array.from({length:3},(_,channel)=>{
    const bits=new Uint8Array(size);let count=0;
    for(let i=0;i<size;i++){bits[i]=tensor.data[channel*size+i]?1:0;count+=bits[i];}
    const matches=points.filter(([x,y,label])=>bits[y*width+x]===label).length;
    const score=scores[channel];
    return {bits,count,score,channel,matches,eligible:Number.isFinite(score)&&count>0&&count<size&&matches===points.length};
  });
}
export function chooseCandidate(candidates){
  // No ground-truth input: choose only prompt-consistent, nontrivial masks by model score.
  const best=candidates.filter(c=>c.eligible).sort((a,b)=>b.score-a.score||a.channel-b.channel)[0];
  if(!best)throw Error("no_valid_mask");
  return best;
}
export function selectMask(tensor,scores,x,y,width=WIDTH,height=HEIGHT){
  return chooseCandidate(maskCandidates(tensor,scores,[[x,y,1]],width,height));
}
export function intersectionOverUnion(bits,truth){
  if(bits.length!==truth.length)throw Error("dimension_mismatch");
  let union=0,intersection=0;
  for(let i=0;i<bits.length;i++){if(bits[i]||truth[i])union++;if(bits[i]&&truth[i])intersection++;}
  return union?intersection/union:0;
}
