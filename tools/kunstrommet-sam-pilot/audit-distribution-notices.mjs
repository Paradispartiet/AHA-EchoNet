// Review evidence from exact npm artifacts; not a redistribution approval.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,readFile,writeFile,mkdir,rm} from "node:fs/promises";
import {createHash} from "node:crypto";
import os from "node:os";
import path from "node:path";
const stage=process.env.KR_PILOT_DIR,out=process.env.KR_NOTICE_DIR;
assert.ok(stage&&out,"missing staged runtime or notice output");
await mkdir(out,{recursive:false});
const tmp=await mkdtemp(path.join(os.tmpdir(),"kr-notices-"));
const packages=[
 ["@huggingface/transformers","3.8.1","sha512-tsTk4zVjImqdqjS8/AOZg2yNLd1z9S5v+7oUPpXaasDRwEDhB+xnglK1k5cad26lL5/ZIaeREgWWy0bs9y9pPA=="],
 ["onnxruntime-web","1.22.0-dev.20250409-89f8206ba4","sha512-0uS76OPgH0hWCPrFKlL8kYVV7ckM7t/36HfbgoFw6Nd0CZVVbQC4PkrR8mBX8LtNUFZO25IQBqV2Hx2ho3FlbQ=="],
 ["@huggingface/jinja","0.5.3","sha512-asqfZ4GQS0hD876Uw4qiUb7Tr/V5Q+JZuo2L+BtdrD4U40QU58nIRq3ZSgAzJgT874VLjhGVacaYfrdpXtEvtA=="],
 ["onnxruntime-common","1.22.0-dev.20250409-89f8206ba4","sha512-vDJMkfCfb0b1A836rgHj+ORuZf4B4+cc2bASQtpeoJLueuFc5DuYwjIZUBrSvx/fO5IrLjLz+oTrB3pcGlhovQ=="]
];
const hash=(bytes,alg="sha256",encoding="hex")=>createHash(alg).update(bytes).digest(encoding);
const report={distributionApproved:false,source:"Transformers.js 3.8.1 source package-lock.json and verified npm archives",packages:[],gaps:[]};
try{
 for(const [name,version,integrity] of packages){
  const [p]=JSON.parse(execFileSync("npm",["pack",name+"@"+version,"--ignore-scripts","--json"],{cwd:tmp,encoding:"utf8",maxBuffer:8*1024*1024}));
  assert.equal(p.name,name);assert.equal(p.version,version);assert.equal(p.integrity,integrity);
  const archive=path.join(tmp,p.filename);
  assert.equal("sha512-"+hash(await readFile(archive),"sha512","base64"),integrity);
  const list=execFileSync("tar",["-tzf",archive],{encoding:"utf8",maxBuffer:8*1024*1024}).trim().split("\n");
  const extract=file=>execFileSync("tar",["-xOzf",archive,file],{maxBuffer:40*1024*1024});
  const meta=JSON.parse(extract("package/package.json").toString("utf8"));
  const files=list.filter(x=>/(^|\/)(?:licen[cs]e|notice|third[-_ ]?party[-_ ]?notices|copying)(?:\.[a-z0-9]+)?$/i.test(x)||/\.LICENSE\.txt$/i.test(x));
  const dest=path.join(out,name.replace(/[^a-z0-9-]/gi,"_")+"-"+version);await mkdir(dest);
  const found=[];
  for(const [i,file] of files.entries()){
   const bytes=extract(file);assert.ok(bytes.length>0);const target=i+"-"+path.basename(file);
   await writeFile(path.join(dest,target),bytes);found.push({source:file,local:target,sha256:hash(bytes)});
  }
  if(!found.length)report.gaps.push(name+": no license/notice file in archive");
  if(name==="onnxruntime-web"){
   for(const file of ["ort-wasm-simd-threaded.jsep.mjs","ort-wasm-simd-threaded.jsep.wasm"]){
    const bytes=extract("package/dist/"+file);assert.equal(hash(bytes),hash(await readFile(path.join(stage,"runtime",file))),file+" must match staged binary");
   }
   if(!found.some(f=>/third.?party|notice/i.test(f.source)))report.gaps.push("ORT native/WASM third-party notice file not found in exact archive");
  }
  if(name==="@huggingface/transformers"){
   assert.equal(hash(extract("package/dist/transformers.js")),hash(await readFile(path.join(stage,"runtime/transformers.js"))));
   if(!found.some(f=>/dist\/.*LICENSE/i.test(f.source)))report.gaps.push("Bundled JS dependency notices need manual coverage review");
  }
  report.packages.push({name,version,license:meta.license,integrity,found});
 }
 // Public model card pinned to the exact weight revision; it is review evidence.
 const url="https://huggingface.co/Xenova/slimsam-77-uniform/resolve/d827ef090922d0c7b96fc6111908fb996ff3d1c1/README.md";
 try{
  const card=execFileSync("curl",["--fail","--silent","--show-error","--location","--proto","=https","--proto-redir","=https","--max-time","60",url],{maxBuffer:1024*1024});
  await writeFile(path.join(out,"slimsam-model-card.md"),card);
  report.model={url,sha256:hash(card),apacheTag:/^license:\s*apache-2\.0\s*$/m.test(card.toString("utf8"))};
  if(!report.model.apacheTag)report.gaps.push("Pinned model card license tag needs verification");
 }catch(_){report.gaps.push("Exact model card unavailable");}
 report.gaps.push("Manual review of transitive bundled code, ORT native dependencies, model upstream attribution and CC0 photo provenance remains mandatory");
 await writeFile(path.join(out,"notice-report.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(report,null,2));
}finally{await rm(tmp,{recursive:true,force:true});}
