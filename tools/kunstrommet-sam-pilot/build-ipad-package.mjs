// Builds a disposable, isolated Kunstrommet pilot for a future protected iPad test.
// No deploy, no credentials, no AHA auth, backend or production bundle changes.
import assert from "node:assert/strict";
import {mkdir,readFile,writeFile,copyFile,stat,readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const repo=fileURLToPath(new URL("../../",import.meta.url));
assert.ok(process.env.KR_PILOT_DIR&&process.env.KR_IPAD_DIR,"set separate staged-model and iPad output dirs");
const stage=path.resolve(process.env.KR_PILOT_DIR),out=path.resolve(process.env.KR_IPAD_DIR);
assert.notEqual(stage,out);
assert.ok(!out.startsWith(stage+path.sep)&&!stage.startsWith(out+path.sep));
await mkdir(out,{recursive:false}); // must not exist; never overwrite a previous package
const prefix="tools/kunstrommet-sam-pilot/";
const model="models/Xenova/slimsam-77-uniform/";
const sourceFiles=["js/ahaKunstrommetV2.js","css/aha-chat.css","css/aha-dashboard.css","css/aha-global-nav.css","css/aha-kunstrommet-v2.css",prefix+"editor-worker.mjs",prefix+"core.mjs"];
const stagedFiles=["runtime/transformers.js","runtime/ort-wasm-simd-threaded.jsep.mjs","runtime/ort-wasm-simd-threaded.jsep.wasm",model+"config.json",model+"preprocessor_config.json",model+"onnx/vision_encoder_quantized.onnx",model+"onnx/prompt_encoder_mask_decoder_quantized.onnx"];
const entries=[];
async function copy(root,relative,target=relative){
 const source=path.join(root,relative),dest=path.join(out,target),info=await stat(source);
 assert.ok(info.isFile()&&info.size>0,target);
 await mkdir(path.dirname(dest),{recursive:true});
 await copyFile(source,dest);entries.push({path:target,bytes:info.size});
}
for(const file of sourceFiles)await copy(repo,file);
for(const file of stagedFiles)await copy(stage,file,prefix+file);
await copy(stage,"photos/chelsea.png","sample.png");
let html=await readFile(path.join(repo,"kunstrommet.html"),"utf8");
const scripts=[...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)];
assert.ok(scripts.length>1&&scripts.some(m=>m[0]==='<script src="js/ahaKunstrommetV2.js"></script>'));
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
html=html.replace("</body>",'<script src="js/ipad-pilot-flags.js"></script><script src="js/ahaKunstrommetV2.js"></script>\n</body>');
html=html.replace('<h1>Kunstrommet</h1>','<h1>Kunstrommet – isolert iPad-pilot</h1><p>Kun offentlig testfoto. Ingen AHA-innlogging eller skyfunksjoner. <a href="sample.png" download>Lagre testfoto til Filer</a> og importer det i atelieret.</p>');
assert.ok(html.includes("isolert iPad-pilot"),"heading anchor");
await writeFile(path.join(out,"index.html"),html);
await writeFile(path.join(out,"js/ipad-pilot-flags.js"),'window.AHA_KUNSTROMMET_LOCAL_MASK_PILOT=true;\nwindow.AHA_KUNSTROMMET_AI_TOOL_PILOT=true;\n');
await writeFile(path.join(out,"_headers"),"/*\n  Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Referrer-Policy: no-referrer\n  Cache-Control: no-store\n");
await writeFile(path.join(out,"robots.txt"),"User-agent: *\nDisallow: /\n");
for(const p of ["index.html","js/ipad-pilot-flags.js","_headers","robots.txt"])entries.push({path:p,bytes:(await stat(path.join(out,p))).size});
assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]),["js/ipad-pilot-flags.js","js/ahaKunstrommetV2.js"]);
const max=25*1024*1024;
const report={files:entries,totalBytes:entries.reduce((a,e)=>a+e.bytes,0),oversize:entries.filter(e=>e.bytes>max),cloudflarePagesSizeGate:entries.every(e=>e.bytes<=max),deployment:false};
console.log(JSON.stringify(report,null,2));
assert.ok(report.cloudflarePagesSizeGate,"file exceeds conservative Pages 25 MiB limit; do not deploy");
