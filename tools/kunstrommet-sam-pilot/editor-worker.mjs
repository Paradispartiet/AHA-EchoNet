import {maskCandidates,chooseCandidate} from "./core.mjs";
// Editor-only opt-in worker. The staged runtime/model must be same-origin.
// One request per worker, no remote model or image URL.
let started=false;
self.onmessage=async({data})=>{
 if(started||data?.type!=="segment")return;
 started=true;
 let model,inputs,outputs,masks;
 try{
  const {width,height,rgba,points}=data;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<320||height<320||width>1600||height>1600||width*height>1440000||
     !(rgba instanceof Uint8ClampedArray)||rgba.length!==width*height*4||!Array.isArray(points)||points.length>12||!points.some(p=>p?.[2]===1)||
     points.some(p=>!Array.isArray(p)||p.length!==3||!Number.isInteger(p[0])||!Number.isInteger(p[1])||p[0]<0||p[1]<0||p[0]>=width||p[1]>=height||![0,1].includes(p[2])))throw Error("invalid_input");
  const {env,SamModel,AutoProcessor,RawImage}=await import("./runtime/transformers.js");
  env.allowLocalModels=true;env.allowRemoteModels=false;env.useBrowserCache=false;
  env.localModelPath=new URL("./models/",import.meta.url).href;
  env.backends.onnx.wasm.wasmPaths=new URL("./runtime/",import.meta.url).href;
  env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
  const id="Xenova/slimsam-77-uniform",options={device:"wasm",dtype:"q8",local_files_only:true};
  const processor=await AutoProcessor.from_pretrained(id,options);
  model=await SamModel.from_pretrained(id,options);
  const image=new RawImage(new Uint8Array(rgba.buffer),width,height,4);
  inputs=await processor(image,{input_points:[points.map(([x,y])=>[x,y])],input_labels:[points.map(p=>p[2])]});
  outputs=await model(inputs);
  masks=await processor.post_process_masks(outputs.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
  const {bits}=chooseCandidate(maskCandidates(masks[0],outputs.iou_scores.data,points,width,height));
  self.postMessage({type:"mask",bits},[bits.buffer]);
 }catch(_){self.postMessage({type:"error"});}
 finally{
  for(const tensor of new Set([...Object.values(inputs||{}),...Object.values(outputs||{}),...(masks||[])])){try{tensor?.dispose?.();}catch(_){}}
  try{await model?.dispose?.();}catch(_){}
 }
};
