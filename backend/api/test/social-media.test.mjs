import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiException } from "../dist/api/api-exception.js";
import { SocialMediaService, validateStagingImage, MAX_SOCIAL_IMAGE_BYTES } from "../dist/social/social-media.module.js";

function png(width = 8, height = 8) {
  const bytes = Buffer.alloc(108);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
  bytes.write("IHDR",12,"ascii");
  bytes.writeUInt32BE(width,16);
  bytes.writeUInt32BE(height,20);
  return bytes;
}

function webp(width = 8, height = 8) {
  const bytes = Buffer.alloc(108);
  bytes.write("RIFF",0,"ascii");
  bytes.writeUInt32LE(bytes.length-8,4);
  bytes.write("WEBP",8,"ascii");
  bytes.write("VP8 ",12,"ascii");
  Buffer.from("9d012a","hex").copy(bytes,23);
  bytes.writeUInt16LE(width,26);
  bytes.writeUInt16LE(height,28);
  return bytes;
}

test("staging image validation is binary-only, dimension-bounded and allows only PNG and WebP", () => {
  assert.equal(validateStagingImage("image/png",png()).length,108);
  assert.equal(validateStagingImage("image/webp",webp()).length,108);
  for(const [type,input] of [
    ["image/jpeg",png()], ["image/svg+xml",Buffer.from("<svg>")], ["video/mp4",Buffer.alloc(256)], ["video/webm",Buffer.alloc(256)],
    ["image/png",Buffer.from("not a PNG")], ["image/webp",png()],
    ["image/png",png(4096,10)], ["image/webp",webp(8,4096)],
    ["image/png",Buffer.alloc(MAX_SOCIAL_IMAGE_BYTES+1)], ["image/png",null]
  ]) {
    assert.throws(()=>validateStagingImage(type,input),e=>e instanceof ApiException);
  }
});

test("staging media service checks disabled gate and upload idempotency key before storage", async()=>{
  const principal = {subject:"test-profile",provider:"test",issuer:"https://issuer",audience:["api"]};
  let calls=0;
  const repo={
    async upload(p,mime,bytes,key){
      assert.equal(p,principal);
      assert.equal(mime,"image/png");
      assert.ok(Buffer.isBuffer(bytes));
      assert.equal(key,"request-12345");
      calls++;
      return {mediaId:"11111111-1111-4111-8111-111111111111",mediaUrl:"/v1/social/media/11111111-1111-4111-8111-111111111111"};
    }
  };
  const service=new SocialMediaService({assertEnabled(){}},repo);
  await assert.rejects(service.upload(principal,"image/png",png(),"bad key"));
  const result=await service.upload(principal,"image/png",png(),"request-12345");
  assert.match(result.mediaUrl,/\/v1\/social\/media\//);
  assert.equal(calls,1);
  const denied = new SocialMediaService({assertEnabled(){throw new ApiException(503,"SOCIAL_DISABLED","disabled");}},repo);
  await assert.rejects(denied.upload(principal,"image/png",png(),"request-12345"),e=>e.code==="SOCIAL_DISABLED");
  assert.equal(calls,1);
});
