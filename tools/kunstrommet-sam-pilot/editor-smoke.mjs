import assert from "node:assert/strict";
import http from "node:http";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {chromium,webkit} from "@playwright/test";
import {fixture,GUIDED_POINTS,WIDTH,HEIGHT} from "./core.mjs";
assert.ok(process.env.KR_PILOT_DIR,"missing staged model");
const root=path.resolve(process.env.KR_PILOT_DIR),repo=process.cwd(),prefix="/tools/kunstrommet-sam-pilot/";
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".wasm":"application/wasm",".onnx":"application/octet-stream"};
const server=http.createServer(async(req,res)=>{
 try{
  res.setHeader("Content-Security-Policy","default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405).end();return;}
  const p=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  let file;
  if(p==="/kunstrommet.html"){
   // Same production editor markup, with unrelated app bridges omitted in this isolated test.
   const html=(await readFile(path.join(repo,"kunstrommet.html"),"utf8")).replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>src==="js/ahaKunstrommetV2.js"?tag:"");
   res.setHeader("Content-Type",mime[".html"]);res.end(html);return;
  }
  if(p==="/js/ahaKunstrommetV2.js"||/^\/css\/[a-zA-Z0-9-]+\.css$/.test(p))file=path.join(repo,p);
  else if(p===prefix+"editor-worker.mjs"||p===prefix+"core.mjs")file=path.join(repo,p);
  else if(p.startsWith(prefix+"runtime/")||p.startsWith(prefix+"models/")){
   file=path.resolve(root,p.slice(prefix.length));if(!file.startsWith(root+path.sep))throw Error("path");
  }else{res.writeHead(404).end();return;}
  if(!mime[path.extname(file)]||!(await stat(file)).isFile())throw Error("missing");
  res.setHeader("Content-Type",mime[path.extname(file)]);res.end(req.method==="HEAD"?undefined:await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
try{
 for(const [name,engine] of [["chromium",chromium],["webkit",webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:820,height:1180},serviceWorkers:"block"});
   const blocked=[];await context.route("**/*",route=>{if(new URL(route.request().url()).origin!==origin){blocked.push(route.request().url());return route.abort();}return route.continue();});
   await context.addInitScript(()=>{window.AHA_KUNSTROMMET_LOCAL_MASK_PILOT=true;window.AHA_KUNSTROMMET_AI_TOOL_PILOT=true;});
   const page=await context.newPage();await page.goto(origin+"/kunstrommet.html");
   await page.locator(".kv2-size-panel summary").click();
   await page.locator("#kv2-canvas-width").fill("640");await page.locator("#kv2-canvas-height").fill("480");await page.locator("#kv2-new-sized").click();
   const image=await page.evaluate(({rgb,w,h})=>{
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d"),im=ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){im.data.set(rgb.slice(i*3,i*3+3),i*4);im.data[i*4+3]=255;}
    ctx.putImageData(im,0,0);return canvas.toDataURL("image/png").split(",")[1];
   },{rgb:Array.from(fixture().rgb),w:WIDTH,h:HEIGHT});
   await page.locator("#kv2-photo").setInputFiles({name:"synthetic.png",mimeType:"image/png",buffer:Buffer.from(image,"base64")});
   const snapshot=()=>page.evaluate(()=>window.AHAKunstrommetV2.cloudSnapshot("local").data);
   await page.waitForFunction(()=>{try{return window.AHAKunstrommetV2.cloudSnapshot("local").data.layers.length===2;}catch{return false;}});
   const before=await snapshot();
   await page.locator("#kv2-ai-region").click();
   for(const [x,y,label] of GUIDED_POINTS){
    await page.locator("#kv2-ai-point-mode").selectOption(String(label));
    await page.locator("#kv2-canvas").evaluate((c,p)=>{const r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerType:"pen",button:0,clientX:r.left+(p[0]+.25)/640*r.width,clientY:r.top+(p[1]+.25)/480*r.height}));},[x*2,y*2]);
   }
   assert.equal(await page.locator(".kv2-ai-point").count(),GUIDED_POINTS.length);
   const start=performance.now();await page.locator("#kv2-ai-analyze").click();
   await page.waitForFunction(()=>!document.querySelector("#kv2-color-region-apply").disabled||/kunne ikke|Ingen gyldig|avbrutt etter|ikke tilgjengelig/.test(document.querySelector("#kv2-status").textContent),{},{timeout:255000});
   const state=await page.locator("#kv2-status").innerText();assert.ok(await page.locator("#kv2-color-region-apply").isEnabled(),state);
   const alpha=await page.locator("#kv2-color-region-overlay").evaluate((c,ps)=>ps.map(([x,y])=>c.getContext("2d").getImageData(x*2,y*2,1,1).data[3]),GUIDED_POINTS);
   assert.deepEqual(alpha,GUIDED_POINTS.map(p=>p[2]?110:0));
   assert.deepEqual((await snapshot()).layers,before.layers);
   await page.locator("#kv2-color-region-apply").click();
   const after=await snapshot();assert.ok(after.layers[1].maskBitmap);assert.equal(after.layers[1].bitmap,before.layers[1].bitmap);
   await page.locator("#kv2-undo").click();
   await page.waitForFunction(()=>{try{return !window.AHAKunstrommetV2.cloudSnapshot("local").data.layers[1].maskBitmap;}catch{return false;}});
   assert.deepEqual((await snapshot()).layers,before.layers);
   assert.deepEqual(blocked,[]);console.log(JSON.stringify({browser:name,editorInferenceMs:Math.round(performance.now()-start),status:state}));
  }finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));}
