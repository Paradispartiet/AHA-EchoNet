#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { generateKeyPairSync, randomUUID, sign } = require("node:crypto");

const HOST = "127.0.0.1";
const PORT = 3210;
const ISSUER = `http://${HOST}:${PORT}`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const AUDIENCE = "aha-canonical-sync-hosted-staging-e2e";
const SUBJECT = "aha-canonical-sync-hosted-staging-ci";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function generate(targetDir, githubEnvPath) {
  if (!targetDir || !githubEnvPath) throw new Error("generate requires targetDir and GITHUB_ENV path");
  fs.mkdirSync(targetDir, { recursive: true });
  const kid = `aha-staging-${randomUUID()}`;
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const jwks = {
    keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }]
  };
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid };
  const payload = {
    sub: SUBJECT,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    nbf: now - 5,
    exp: now + 15 * 60
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  const token = `${signingInput}.${signature}`;
  const jwksPath = path.join(targetDir, "aha-canonical-sync-staging-jwks.json");
  fs.writeFileSync(jwksPath, JSON.stringify(jwks), { mode: 0o600 });
  fs.appendFileSync(githubEnvPath, [
    `AHA_STAGING_SYNC_BEARER_TOKEN=${token}`,
    `AHA_AUTH_ISSUER=${ISSUER}`,
    `AHA_AUTH_AUDIENCE=${AUDIENCE}`,
    `AHA_AUTH_JWKS_URL=${JWKS_URL}`,
    `AHA_STAGING_JWKS_FILE=${jwksPath}`,
    ""
  ].join("\n"), { mode: 0o600 });
}

function serve(jwksPath) {
  if (!jwksPath) throw new Error("serve requires JWKS path");
  const jwks = fs.readFileSync(jwksPath, "utf8");
  JSON.parse(jwks);
  const server = http.createServer((request, response) => {
    if (request.url === "/.well-known/jwks.json") {
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store"
      });
      response.end(jwks);
      return;
    }
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"error":"not_found"}');
  });
  server.listen(PORT, HOST, () => {
    process.stdout.write("AHA hosted staging ephemeral JWKS server: READY\n");
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

const [command, first, second] = process.argv.slice(2);
if (command === "generate") generate(first, second);
else if (command === "serve") serve(first);
else throw new Error("usage: auth-fixture.cjs generate <dir> <github-env> | serve <jwks-file>");
