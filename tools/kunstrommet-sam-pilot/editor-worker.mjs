import {maskCandidates,chooseCandidate} from "./core.mjs";
// One worker holds at most one immutable layer snapshot and its embeddings.
// The editor terminates it on context change, cancel, hide, failure or idle.
let model,processor,image,embeddings,busy=false,encoderRuns=0;
function validPoints(points,width,height){
 return Array.isArray(points)&&points.length<=12&&points.some(p=>p?.[2]===1)&&points.every(p=>Array.isArray(p)&&p.length===3&&Number.isInteger(p[0])&&Number.isInteger(p[1])&&p[0]>=0&&p[1]>=0&&p[0]<width&&p[1]<height&&[0,1].includes(p[2]));
}
self.onmessage=async({data})=>{
 if(busy||!["segment","refine"].includes(data?.type)||!Number.isSafeInteger(data.id))return;
 busy=true;
 let inputs,outputs,masks;
 try{
  const reused=data.type==="refine";
  if(!reused){
   const {width,height,rgba,points}=data;
   if(image||!Number.isInteger(width)||!Number.isInteger(height)||width<320||height<320||width>1600||height>1600||width*height>1440000||
      !(rgba instanceof Uint8ClampedArray)||rgba.length!==width*height*4||!validPoints(points,width,height))throw Error("invalid_input");
   const {env,SamModel,AutoProcessor,RawImage}=await import("./runtime/transformers.js");
   env.allowLocalModels=true;env.allowRemoteModels=false;env.useBrowserCache=false;
   env.localModelPath=new URL("./models/",import.meta.url).href;
   env.backends.onnx.wasm.wasmPaths=new URL("./runtime/",import.meta.url).href;
   env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
   const modelId="Xenova/slimsam-77-uniform",options={device:"wasm",dtype:"q8",local_files_only:true};
   processor=await AutoProcessor.from_pretrained(modelId,options);
   model=await SamModel.from_pretrained(modelId,options);
   image=new RawImage(new Uint8Array(rgba.buffer),width,height,4);
  }else if(!image||!embeddings||!validPoints(data.points,image.width,image.height))throw Error("invalid_refinement");
  const points=data.points;
  // The processor still normalizes prompt coordinates; only the expensive image
  // encoder is reused. Retain the exact source image for this session only.
  inputs=await processor(image,{input_points:[points.map(([x,y])=>[x,y])],input_labels:[points.map(p=>p[2])]});
  if(!embeddings){embeddings=await model.get_image_embeddings({pixel_values:inputs.pixel_values});encoderRuns++;}
  outputs=await model({...inputs,...embeddings});
  masks=await processor.post_process_masks(outputs.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
  const {bits}=chooseCandidate(maskCandidates(masks[0],outputs.iou_scores.data,points,image.width,image.height));
  self.postMessage({type:"mask",id:data.id,bits,reused,encoderRuns},[bits.buffer]);
 }catch(_){self.postMessage({type:"error",id:data.id});}
 finally{
  const keep=new Set(Object.values(embeddings||{}));
  for(const tensor of new Set([...Object.values(inputs||{}),...Object.values(outputs||{}),...(masks||[])])){if(!keep.has(tensor)){try{tensor?.dispose?.();}catch(_){}}}
  busy=false;
 }
};
