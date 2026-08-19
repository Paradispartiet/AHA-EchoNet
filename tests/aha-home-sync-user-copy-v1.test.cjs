const assert = require("node:assert/strict");
const fs = require("node:fs");

const path = "js/ahaSyncHub.js";
assert.equal(fs.existsSync(path), true, `${path} mangler`);
const source = fs.readFileSync(path, "utf8");

assert.match(source, /Synkroniser AHA/);
assert.match(source, /Synkroniser nå/);
assert.match(source, /Bekreft og synkroniser/);
assert.match(source, /Hold AHA-dataene dine oppdatert på tvers av økter/);
assert.match(source, /Synkronisering skjer bare når du ber om det/);
assert.match(source, /AHA er allerede oppdatert\./);
assert.match(source, /AHA er synkronisert\./);
assert.match(source, /Tekniske detaljer/);
assert.match(source, /aha-canonical-production-home-sync-technical-result/);
assert.match(source, /control\.renderResult\(summary\)/);
assert.match(source, /summarizeProductionResult/);

assert.doesNotMatch(source, /Pilotgrensen håndheves på serveren/);
assert.doesNotMatch(source, /Endrede AHA-data sendes til production/);
assert.doesNotMatch(source, /Laster production-sync etter eksplisitt bekreftelse/);
assert.doesNotMatch(source, /Synkroniserer eksplisitt mot production/);

const runHandlerIndex = source.indexOf('run?.addEventListener("click"');
const lazyLoadIndex = source.indexOf("await loadProductionControl()", runHandlerIndex);
assert.ok(runHandlerIndex >= 0, "manual sync run handler is required");
assert.ok(lazyLoadIndex > runHandlerIndex, "canonical production controller must remain lazy-loaded after explicit confirmation");
assert.doesNotMatch(source, /MutationObserver/);
assert.doesNotMatch(source, /setInterval\s*\(/);
assert.doesNotMatch(source, /onAuthStateChange|SIGNED_IN|TOKEN_REFRESHED/);

console.log("aha-home-sync-user-copy-v1.test.cjs passed");
