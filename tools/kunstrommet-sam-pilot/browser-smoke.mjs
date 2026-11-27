import assert from "node:assert/strict";
import http from "node:http";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {chromium,webkit} from "@playwright/test";
const root=path.resolve(process.env.KR_PILOT_DIR||"");
assert.ok(process.env.KR_PILOT_DIR,"missing pilot root");
const mime={".html":"text/html; charset=utf-8",".mjs":"text/javascript",".js":"text/javascript",".css":"text/css",".json":"application/json",".wasm":"application/wasm",".onnx":"application/octet-stream"};
const csp="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'";
const server=http.createServer(async(req,res)=>{
  res.setHeader("Content-Security-Policy",csp);
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Cache-Control","no-store");
  try{
    if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405).end();return;}
    const url=new URL(req.url,"http://localhost");
    const file=path.resolve(root,"."+decodeURIComponent(url.pathname==="/" ? "/index.html":url.pathname));
    if(!file.startsWith(root+path.sep)||!mime[path.extname(file)]||!(await stat(file)).isFile()){res.writeHead(404).end();return;}
    res.setHeader("Content-Type",mime[path.extname(file)]);
    res.end(req.method==="HEAD"?undefined:await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const failures=[];
try{
  for(const [name,engine] of [["chromium",chromium],["webkit",webkit]]){
    let browser;
    try{
      browser=await engine.launch({headless:true});
      const context=await browser.newContext({serviceWorkers:"block",viewport:{width:820,height:1180}});
      const blocked=[],errors=[],requests=[];
      await context.route("**/*",route=>{
        const u=route.request().url();
        if(new URL(u).origin!==origin){blocked.push(u);return route.abort();}
        return route.continue();
      });
      context.on("request",r=>requests.push(r.url()));
      const page=await context.newPage();
      page.on("console",m=>{if(m.type()==="error")errors.push(m.text().slice(0,500));});
      page.on("pageerror",e=>errors.push(e.message.slice(0,500)));
      await page.goto(origin);
      await page.locator("#run").click();
      await page.waitForFunction(()=>!document.querySelector("#run").disabled,{},{timeout:255000});
      const status=await page.locator("#status").innerText(),raw=await page.locator("#result").innerText();
      console.log(JSON.stringify({browser:name,status,result:raw,errors,blocked,requests},null,2));
      assert.equal(blocked.length,0,"external browser request blocked");
      assert.ok(requests.every(u=>new URL(u).origin===origin),"non-local browser request");
      assert.ok(status.startsWith("Test ferdig."),"real model inference did not finish: "+status);
      const result=JSON.parse(raw);
      for(const k of ["model_score","fixture_iou","load_ms","inference_ms"])assert.ok(Number.isFinite(result[k]),k);
      assert.ok(result.fixture_iou>=0&&result.fixture_iou<=1,"invalid IoU");
      for(const report of [result.baseline,result.guided]){
        assert.equal(report.candidates.length,3,"all model candidates measured");
        assert.ok(report.candidates.every(c=>Number.isFinite(c.fixture_iou)&&c.fixture_iou>=0&&c.fixture_iou<=1));
      }
      assert.equal(result.guided.candidates.find(c=>c.channel===result.guided.chosen_channel)?.eligible,true,"chosen mask satisfies all prompts");
      // Pilot quality floor only, not a real photo or physical iPad acceptance gate.
      assert.ok(result.fixture_iou>=0.5,"synthetic IoU below pilot floor");
      assert.deepEqual(result.challenges.map(x=>x.id),["ring","low-contrast","neighbor"]);
      for(const item of result.challenges){
        assert.equal(item.candidates.length,3);
        assert.ok(item.candidates.every(c=>Number.isFinite(c.fixture_iou)&&c.fixture_iou>=0&&c.fixture_iou<=1));
        assert.ok(Number.isFinite(item.inference_ms));
        assert.ok(Number.isFinite(item.fixture_iou)&&item.fixture_iou>=0.5,item.id+" below pilot floor or no prompt-consistent mask");
        assert.equal(item.candidates.find(c=>c.channel===item.chosen_channel)?.eligible,true);
      }
      console.log(name+" actual model inference passed");
    }catch(e){failures.push(name+": "+e.message);console.error(name,e.message);}
    finally{await browser?.close();}
  }
  assert.deepEqual(failures,[]);
}finally{await new Promise(resolve=>server.close(resolve));}
