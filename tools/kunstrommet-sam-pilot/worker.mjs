import {WIDTH,HEIGHT,fixture,selectMask,intersectionOverUnion} from "./core.mjs";
let running=false;
self.onmessage=async({data})=>{
  if(running||data?.type!=="run")return;
  running=true;
  let model,inputs,outputs,masks,phase="runtime";
  function step(name){phase=name;self.postMessage({type:"phase",phase});}
  try{
    const start=performance.now();
    // Runtime and model assets must be reviewed and staged locally first.
    // No user images, URLs, remote inference, or automatic loading.
    step("runtime");
    const {env,SamModel,AutoProcessor,RawImage}=await import("./runtime/transformers.js");
    env.allowLocalModels=true;env.allowRemoteModels=false;env.useBrowserCache=false;
    env.localModelPath=new URL("./models/",import.meta.url).href;
    env.backends.onnx.wasm.wasmPaths=new URL("./runtime/",import.meta.url).href;
    env.backends.onnx.wasm.numThreads=1;
    env.backends.onnx.wasm.proxy=false;
    const id="Xenova/slimsam-77-uniform",options={device:"wasm",dtype:"q8",local_files_only:true};
    step("processor");
    const processor=await AutoProcessor.from_pretrained(id,options);
    step("model");
    model=await SamModel.from_pretrained(id,options);
    const loaded=performance.now(),{rgb,truth}=fixture();
    const image=new RawImage(rgb,WIDTH,HEIGHT,3);
    step("preprocess");
    inputs=await processor(image,{input_points:[[[160,120]]]});
    step("inference");
    outputs=await model(inputs);
    step("postprocess");
    masks=await processor.post_process_masks(outputs.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
    step("mask-contract");
    const result=selectMask(masks[0],outputs.iou_scores.data,160,120);
    self.postMessage({type:"result",bits:result.bits,score:result.score,iou:intersectionOverUnion(result.bits,truth),
      loadMs:Math.round(loaded-start),inferMs:Math.round(performance.now()-loaded)},[result.bits.buffer]);
  }catch(e){
    // Synthetic fixture only: bounded error details, no stack trace.
    const detail=String(e?.message||e?.name||"unknown_error").replace(/[\r\n\t]+/g," ").slice(0,300);
    self.postMessage({type:"error",phase,detail,message:"Pilot kunne ikke fullføres i steg: "+phase+"."});
  }
  finally{
    const tensors=new Set([...(Object.values(inputs||{})),...(Object.values(outputs||{})),...(masks||[])]);
    for(const t of tensors){try{t?.dispose?.();}catch(_){}}
    try{await model?.dispose?.();}catch(_){}
    running=false;
  }
};
