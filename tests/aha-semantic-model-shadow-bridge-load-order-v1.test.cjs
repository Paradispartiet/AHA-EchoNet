const assert = require("assert");
const fs = require("fs");

const chatHtml = fs.readFileSync("chat.html", "utf8");
const ingestIndex = chatHtml.indexOf('js/ahaChatIngestRuntime.js');
const bridgeIndex = chatHtml.indexOf('js/ahaSemanticModelShadowBridge.js');
const chatIndex = chatHtml.indexOf('js/ahaChat.js');

assert.ok(ingestIndex >= 0, "chat.html skal laste ingest runtime");
assert.ok(bridgeIndex >= 0, "chat.html skal laste semantic model shadow bridge");
assert.ok(chatIndex >= 0, "chat.html skal laste hoved-chatten");
assert.ok(ingestIndex < bridgeIndex, "bridge må lastes etter deterministic SemanticDocument/ingest runtime");
assert.ok(bridgeIndex < chatIndex, "bridge må bindes før brukerens chat-runtime aktiveres");

console.log("aha-semantic-model-shadow-bridge-load-order-v1 passed");
