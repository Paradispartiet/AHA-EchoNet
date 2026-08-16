"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "..", "js", "ahaCanonicalSyncHash.js");
const source = fs.readFileSync(sourcePath, "utf8");
const moduleShim = { exports: {} };
const context = vm.createContext({
  module: moduleShim,
  exports: moduleShim.exports
});

vm.runInContext(source, context, { filename: sourcePath });

const api = moduleShim.exports;
if (typeof api.canonicalSyncStringify !== "function" || typeof api.canonicalSyncPayloadHash !== "function") {
  throw new Error("AHA canonical sync browser hash contract did not expose the expected CommonJS API");
}

module.exports = api;
