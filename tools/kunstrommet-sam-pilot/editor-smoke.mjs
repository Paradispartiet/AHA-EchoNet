import assert from "node:assert/strict";
import http from "node:http";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {chromium,webkit} from "@playwright/test";
import {fixture,GUIDED_POINTS,WIDTH,HEIGHT} from "./core.mjs";
assert.ok(process.env.KR_PILOT_DIR,"missing staged model");
const root=path.resolve(process.env.KR_PILOT_DIR),repo=process.cwd(),prefix="/tools/kunstrommet-sam-pilot/";
const packageRoot=process.env.KR_IPAD_DIR?path.resolve(process.env.KR_IPAD_DIR):null;
const packageHeaders=packageRoot?Object.fromEntries((await readFile(path.join(packageRoot,"_headers"),"utf8")).split("\n").filter(l=>/^  [A-Za-z-]+:/.test(l)).map(l=>{const i=l.indexOf(":");return [l.slice(2,i),l.slice(i+1).trim()];})):null;
const mime={".png":"image/png",".txt":"text/plain; charset=utf-8",".html":"text/html; charset=utf-8",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".wasm":"application/wasm",".onnx":"application/octet-stream"};
const server=http.createServer(async(req,res)=>{
 try{
  res.setHeader("Content-Security-Policy","default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405).end();return;}
  const p=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  let file;
  if(packageRoot){
   for(const [key,value] of Object.entries(packageHeaders))res.setHeader(key,value);
   file=path.resolve(packageRoot,"."+(p==="/"?"/index.html":p));
   if(!file.startsWith(packageRoot+path.sep))throw Error("path");
  }else if(p==="/kunstrommet.html"){
   // Same production editor markup, with unrelated app bridges omitted in this isolated test.
   const html=(await readFile(path.join(repo,"kunstrommet.html"),"utf8")).replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>src==="js/ahaKunstrommetV2.js"?tag:"");
   res.setHeader("Content-Type",mime[".html"]);res.end(html);return;
  }
  if(!packageRoot){
  if(p==="/js/ahaKunstrommetV2.js"||/^\/css\/[a-zA-Z0-9-]+\.css$/.test(p))file=path.join(repo,p);
  else if(p===prefix+"editor-worker.mjs"||p===prefix+"core.mjs")file=path.join(repo,p);
  else if(p.startsWith(prefix+"runtime/")||p.startsWith(prefix+"models/")){
   file=path.resolve(root,p.slice(prefix.length));if(!file.startsWith(root+path.sep))throw Error("path");
  }else{res.writeHead(404).end();return;}
  }
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
   if(!packageRoot)await context.addInitScript(()=>{window.AHA_KUNSTROMMET_LOCAL_MASK_PILOT=true;window.AHA_KUNSTROMMET_AI_TOOL_PILOT=true;});
   const page=await context.newPage();
   const response=await page.goto(origin+(packageRoot?"/":"/kunstrommet.html"));
   if(packageRoot){
    assert.equal(response.headers()["content-security-policy"],packageHeaders["Content-Security-Policy"]);
    assert.equal(response.headers()["x-robots-tag"],"noindex, nofollow, noarchive");
    assert.ok(await page.locator("#kv2-ai-region").isVisible(),"packaged flags activate editor without injected globals");
    assert.equal(await page.locator("#kv2-cloud-backup").count(),0,"no cloud controls");
    assert.equal(await page.locator('section[aria-labelledby="kv2-aha-title"]').count(),0);
    const sample=await context.request.get(origin+"/sample.png");
    assert.ok(sample.ok());assert.equal(sample.headers()["content-type"],"image/png");
   }
   // Exercise the actual default compact workspace, not a hidden old control.
   if(await page.locator("#main").getAttribute("data-studio-layout")==="compact")await page.locator("#kv2-studio-project").click();
   await page.locator(".kv2-size-panel summary").click();
   await page.locator("#kv2-canvas-width").fill("640");await page.locator("#kv2-canvas-height").fill("480");await page.locator("#kv2-new-sized").click();
   if(await page.locator("#main").getAttribute("data-studio-layout")==="compact")await page.locator("#kv2-studio-layers").click();
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
   const coldMs=Math.round(performance.now()-start);
   const panel=page.locator("#kv2-ai-region-controls");
   assert.equal(await panel.getAttribute("data-cache"),"cold");
   assert.equal(await panel.getAttribute("data-encoder-runs"),"1");
   const warmTimes=[];
   for(let cycle=0;cycle<5;cycle++){
    await page.locator("#kv2-ai-undo-point").click();
    await page.locator("#kv2-ai-point-mode").selectOption(String(GUIDED_POINTS.at(-1)[2]));
    const [lx,ly]=GUIDED_POINTS.at(-1);
    // Alternate two nearby positions of the same negative prompt.
    await page.locator("#kv2-canvas").evaluate((c,p)=>{const r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerType:"pen",button:0,clientX:r.left+(p[0]+.25)/640*r.width,clientY:r.top+(p[1]+.25)/480*r.height}));},[lx*2+(cycle%2),ly*2]);
    const warmStart=performance.now();
    await page.locator("#kv2-ai-analyze").click();
    await page.waitForFunction(()=>!document.querySelector("#kv2-color-region-apply").disabled||/kunne ikke|Ingen gyldig|avbrutt etter|ikke tilgjengelig/.test(document.querySelector("#kv2-status").textContent),{},{timeout:255000});
    assert.ok(await page.locator("#kv2-color-region-apply").isEnabled(),await page.locator("#kv2-status").innerText());
    assert.equal(await panel.getAttribute("data-cache"),"warm");
    assert.equal(await panel.getAttribute("data-encoder-runs"),"1");
    warmTimes.push(Math.round(performance.now()-warmStart));
    assert.deepEqual((await snapshot()).layers,before.layers);
   }
   const warmMs=warmTimes.reduce((sum,n)=>sum+n,0)/warmTimes.length;
   assert.equal(page.workers().length,1,"exactly one editor worker");
   let workerClosed=false;page.workers()[0].once("close",()=>{workerClosed=true;});
   await page.locator("#kv2-color-region-apply").click();
   for(let i=0;i<100&&!workerClosed;i++)await new Promise(resolve=>setTimeout(resolve,100));
   assert.equal(workerClosed,true,"worker closed after mask confirmation");assert.equal(page.workers().length,0,"worker released on mask confirmation");
   const after=await snapshot();assert.ok(after.layers[1].maskBitmap);assert.equal(after.layers[1].bitmap,before.layers[1].bitmap);
   await page.locator("#kv2-undo").click();
   await page.waitForFunction(()=>{try{return !window.AHAKunstrommetV2.cloudSnapshot("local").data.layers[1].maskBitmap;}catch{return false;}});
   assert.deepEqual((await snapshot()).layers,before.layers);
   assert.deepEqual(blocked,[]);console.log(JSON.stringify({browser:name,coldMs,warmMs,warmTimes,encoderRuns:1,workerReleased:true,status:state}));
  }finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));}
