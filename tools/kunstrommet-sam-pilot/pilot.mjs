import {WIDTH,HEIGHT,fixture} from "./core.mjs";
const canvas=document.getElementById("preview"),ctx=canvas.getContext("2d"),
  run=document.getElementById("run"),stop=document.getElementById("stop"),
  status=document.getElementById("status"),result=document.getElementById("result");
let worker=null,timer=null;
function draw(bits){
  const {rgb}=fixture(),image=ctx.createImageData(WIDTH,HEIGHT);
  for(let i=0;i<WIDTH*HEIGHT;i++){
    const k=i*4;image.data[k]=rgb[i*3];image.data[k+1]=rgb[i*3+1];image.data[k+2]=rgb[i*3+2];image.data[k+3]=255;
    if(bits?.[i]){image.data[k]=Math.round(image.data[k]*.65);image.data[k+1]=Math.round(image.data[k+1]*.65+80);image.data[k+2]=Math.round(image.data[k+2]*.65+80);}
  }
  ctx.putImageData(image,0,0);
}
function finish(message){
  if(timer!==null)clearTimeout(timer);timer=null;
  worker?.terminate();worker=null;run.disabled=false;stop.disabled=true;status.textContent=message;
}
draw();
run.onclick=()=>{
  if(worker)return;
  draw();result.textContent="";run.disabled=true;stop.disabled=false;status.textContent="Laster lokal modell og analyserer testmotivet.";
  try{
    worker=new Worker(new URL("./worker.mjs",import.meta.url),{type:"module"});
    worker.onmessage=({data})=>{
      if(data?.type==="result"){
        draw(data.bits);
        result.textContent=JSON.stringify({model_score:data.score,fixture_iou:data.iou,load_ms:data.loadMs,inference_ms:data.inferMs},null,2);
        finish("Test ferdig. Resultatet gjelder bare dette syntetiske motivet.");
      }else if(data?.type==="error")finish(data.message);
    };
    worker.onerror=()=>finish("Modellen kunne ikke kjøres i denne nettleseren.");
    timer=setTimeout(()=>finish("Avbrutt etter 120 sekunder."),120000);
    worker.postMessage({type:"run"});
  }catch(_){finish("Worker kunne ikke startes.");}
};
stop.onclick=()=>finish("Avbrutt. Worker frigjort.");
window.addEventListener("pagehide",()=>finish("Avsluttet."));
