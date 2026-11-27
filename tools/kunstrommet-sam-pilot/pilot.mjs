import {WIDTH,HEIGHT,fixture} from "./core.mjs";
const canvas=document.getElementById("preview"),ctx=canvas.getContext("2d"),
  run=document.getElementById("run"),stop=document.getElementById("stop"),
  status=document.getElementById("status"),result=document.getElementById("result");
let worker=null,timer=null,lastPhase="startup";
const photoButtons=[document.getElementById("photo-chelsea"),document.getElementById("photo-coffee")];
const phaseLabels={photo:"Laster offentlig testfoto",runtime:"Laster lokal runtime",processor:"Laster bildeprosessor",model:"Laster modellvekter",preprocess:"Forbereder testmotivet",inference:"Kjører KI-modellen",postprocess:"Behandler modellens masker","mask-contract":"Kontrollerer masken"};
function draw(bits){
  canvas.width=WIDTH;canvas.height=HEIGHT;
  const {rgb}=fixture(),image=ctx.createImageData(WIDTH,HEIGHT);
  for(let i=0;i<WIDTH*HEIGHT;i++){
    const k=i*4;image.data[k]=rgb[i*3];image.data[k+1]=rgb[i*3+1];image.data[k+2]=rgb[i*3+2];image.data[k+3]=255;
    if(bits?.[i]){image.data[k]=Math.round(image.data[k]*.65);image.data[k+1]=Math.round(image.data[k+1]*.65+80);image.data[k+2]=Math.round(image.data[k+2]*.65+80);}
  }
  ctx.putImageData(image,0,0);
}
function finish(message){
  if(timer!==null)clearTimeout(timer);timer=null;
  worker?.terminate();worker=null;run.disabled=false;photoButtons.forEach(b=>b.disabled=false);stop.disabled=true;status.textContent=message;
}
draw();
function start(photoId){
  if(worker)return;
  draw();result.textContent="";lastPhase="startup";run.disabled=true;photoButtons.forEach(b=>b.disabled=true);stop.disabled=false;status.textContent="Laster lokal modell og analyserer testmotivet.";
  try{
    worker=new Worker(new URL("./worker.mjs",import.meta.url),{type:"module"});
    worker.onmessage=({data})=>{
      if(data?.type==="result"){
        draw(data.bits);
        result.textContent=JSON.stringify({model_score:data.score,fixture_iou:data.iou,load_ms:data.loadMs,inference_ms:data.inferMs,baseline:data.baseline,guided:data.guided,challenges:data.challenges},null,2);
        finish("Test ferdig. Resultatene gjelder bare syntetiske motiver.");
      }else if(data?.type==="photo-result"){
        canvas.width=data.width;canvas.height=data.height;
        const pixels=ctx.createImageData(data.width,data.height);pixels.data.set(data.rgba);
        for(let i=0;i<data.bits.length;i++)if(data.bits[i]){
          const k=i*4;pixels.data[k]=Math.round(pixels.data[k]*.65);pixels.data[k+1]=Math.round(pixels.data[k+1]*.65+80);pixels.data[k+2]=Math.round(pixels.data[k+2]*.65+80);
        }
        ctx.putImageData(pixels,0,0);
        for(const [x,y] of data.points){ctx.beginPath();ctx.arc(x,y,5,0,2*Math.PI);ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();}
        result.textContent=JSON.stringify({photo_id:data.id,width:data.width,height:data.height,load_ms:data.loadMs,points:data.points,...data.report},null,2);
        finish("Fototest ferdig. Visuell vurdering; ingen fasitmaske.");
      }else if(data?.type==="challenge"){
        status.textContent="Analyserer: "+data.label;
      }else if(data?.type==="phase"&&Object.hasOwn(phaseLabels,data.phase)){
        lastPhase=data.phase;status.textContent=phaseLabels[lastPhase]+" …";
      }else if(data?.type==="error"){
        result.textContent=JSON.stringify({failed_phase:data.phase,error_detail:data.detail},null,2);
        finish(data.message);
      }
    };
    worker.onerror=()=>{result.textContent=JSON.stringify({failed_phase:lastPhase,error_detail:"worker_error"});finish("Modellen kunne ikke kjøres i denne nettleseren.");};
    timer=setTimeout(()=>{result.textContent=JSON.stringify({failed_phase:lastPhase,error_detail:"timeout"});finish("Avbrutt etter 240 sekunder.");},240000);
    worker.postMessage({type:"run",...(photoId?{photoId}:{})});
  }catch(_){finish("Worker kunne ikke startes.");}
}
run.onclick=()=>start();
photoButtons[0].onclick=()=>start("chelsea");
photoButtons[1].onclick=()=>start("coffee");
stop.onclick=()=>finish("Avbrutt. Worker frigjort.");
window.addEventListener("pagehide",()=>finish("Avsluttet."));
