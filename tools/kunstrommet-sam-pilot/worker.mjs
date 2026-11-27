import {WIDTH,HEIGHT,fixture,BASELINE_POINTS,GUIDED_POINTS,CHALLENGES,challengeFixture,maskCandidates,chooseCandidate,intersectionOverUnion} from "./core.mjs";
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
    async function analyze(points,image,truth){
      const started=performance.now();
      step("preprocess");
      inputs=await processor(image,{input_points:[points.map(([x,y])=>[x,y])],input_labels:[points.map(p=>p[2])]});
      step("inference");
      outputs=await model(inputs);
      step("postprocess");
      masks=await processor.post_process_masks(outputs.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
      step("mask-contract");
      const candidates=maskCandidates(masks[0],outputs.iou_scores.data,points);
      let chosen=null;
      try{chosen=chooseCandidate(candidates);}catch(e){if(e.message!=="no_valid_mask")throw e;}
      const report={chosen_channel:chosen?.channel??null,model_score:chosen?.score??null,
        fixture_iou:chosen?intersectionOverUnion(chosen.bits,truth):null,
        inference_ms:Math.round(performance.now()-started),
        candidates:candidates.map(c=>({channel:c.channel,model_score:Number.isFinite(c.score)?c.score:null,
          pixels:c.count,prompt_matches:c.matches,eligible:c.eligible,fixture_iou:intersectionOverUnion(c.bits,truth)}))};
      // Release tensors before the next prompt, preserving only small CPU mask bytes.
      for(const tensor of new Set([...Object.values(inputs),...Object.values(outputs),...masks])){try{tensor?.dispose?.();}catch(_){}}
      inputs=outputs=masks=null;
      return {report,bits:chosen?.bits??null};
    }
    const baseline=await analyze(BASELINE_POINTS,image,truth);
    const guided=await analyze(GUIDED_POINTS,image,truth);
    const challenges=[];
    for(const spec of CHALLENGES){
      self.postMessage({type:"challenge",id:spec.id,label:spec.label});
      const f=challengeFixture(spec.id);
      const sample=await analyze(spec.points,new RawImage(f.rgb,WIDTH,HEIGHT,3),f.truth);
      challenges.push({id:spec.id,label:spec.label,prompt_count:spec.points.length,...sample.report});
    }
    const bits=guided.bits||new Uint8Array(WIDTH*HEIGHT);
    self.postMessage({type:"result",bits,score:guided.report.model_score,iou:guided.report.fixture_iou,
      loadMs:Math.round(loaded-start),inferMs:guided.report.inference_ms,
      baseline:baseline.report,guided:guided.report,challenges},[bits.buffer]);
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
