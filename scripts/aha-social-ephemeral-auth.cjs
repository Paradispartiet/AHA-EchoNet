#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {generateKeyPairSync,randomUUID,sign}=require("node:crypto");
function b64(x){return Buffer.from(JSON.stringify(x)).toString("base64url");}
function generate(dir,envFile){
 if(process.env.GITHUB_ACTIONS!=="true"||process.env.AHA_SOCIAL_EPHEMERAL_ACK!=="RUN_AHA_SOCIAL_EPHEMERAL_CI")
  throw new Error("Isolated CI acknowledgement required");
 if(!process.env.RUNNER_TEMP||!process.env.GITHUB_ENV||
   !path.resolve(dir).startsWith(path.resolve(process.env.RUNNER_TEMP)+path.sep)||
   path.resolve(envFile)!==path.resolve(process.env.GITHUB_ENV))
  throw new Error("Fixture must remain in the isolated GitHub runner");
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const kid="aha-social-"+randomUUID();
 const {publicKey,privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 const jwks={keys:[{...publicKey.export({format:"jwk"}),kid,alg:"RS256",use:"sig"}]};
 const issuer="http://127.0.0.1:3210",audience="aha-social-ephemeral-ci";
 const now=Math.floor(Date.now()/1000),hdr=b64({alg:"RS256",kid,typ:"JWT"});
 function token(subject){
  const input=hdr+"."+b64({sub:subject,iss:issuer,aud:audience,iat:now,nbf:now-5,exp:now+900});
  return input+"."+sign("RSA-SHA256",Buffer.from(input),privateKey).toString("base64url");
 }
 const tokens={
  AHA_SOCIAL_E2E_TOKEN_A:token("rehearsal-user-a"),
  AHA_SOCIAL_E2E_TOKEN_B:token("rehearsal-user-b"),
  AHA_SOCIAL_E2E_TOKEN_MOD:token("rehearsal-user-mod")
 };
 const jwksFile=path.join(dir,"jwks.json");
 fs.writeFileSync(jwksFile,JSON.stringify(jwks),{mode:0o600});
 for(const value of Object.values(tokens))process.stdout.write("::add-mask::"+value+"\n");
 fs.appendFileSync(envFile,[
  ...Object.entries(tokens).map(([k,v])=>k+"="+v),
  "AHA_AUTH_ISSUER="+issuer,
  "AHA_AUTH_AUDIENCE="+audience,
  "AHA_AUTH_JWKS_URL="+issuer+"/.well-known/jwks.json",
  "AHA_STAGING_JWKS_FILE="+jwksFile,
  ""
 ].join("\n"),{mode:0o600});
 process.stdout.write("Three ephemeral signed social CI identities: READY\n");
}
if(require.main===module)generate(process.argv[2],process.argv[3]);
module.exports={generate};
