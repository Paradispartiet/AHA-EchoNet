const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "safari-release-check.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "css/aha-safari-device-evidence.css"), "utf8");
const source = fs.readFileSync(path.join(ROOT, "js/ahaSafariDeviceEvidence.js"), "utf8");

assert.match(html, /viewport-fit=cover/);
assert.match(html, /id="safari-physical-confirmation"/);
assert.match(html, /iPad · Split View/);
assert.match(html, /id="safari-import-evidence"/);
assert.match(html, /Home → Chat/);
assert.match(html, /History Go leses først etter eksplisitt samtykke/);
assert.match(html, /script src="js\/ahaSafariDeviceEvidence\.js"/);
assert.doesNotMatch(html, /https?:\/\//, "evidence surface must not load third-party resources");
assert.match(css, /100dvh/);
assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /min-height:\s*44px/);

for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "AHARepository", "Supabase", "EchoNet", "sendBeacon"]) {
  assert.equal(source.includes(forbidden), false, `evidence runtime must not include ${forbidden}`);
}

const context = { console, Date, JSON, Array, Object, String, Number, Boolean, Set, Map };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "js/ahaSafariDeviceEvidence.js" });
const api = context.AHASafariDeviceEvidence;
assert.ok(api);
assert.equal(api.STORAGE_KEY, "aha_safari_device_evidence_v1");
assert.equal(api.REQUIRED_PROFILES.length, 4);
assert.equal(api.REQUIRED_CHECKS.length, 10);

const iphoneSafari = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
  vendor: "Apple Computer, Inc."
};
const iphoneChrome = { ...iphoneSafari, userAgent: iphoneSafari.userAgent.replace("Version/18.6", "CriOS/151.0") };
const ipadDesktopSafari = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 5,
  vendor: "Apple Computer, Inc."
};
assert.equal(api.detectEnvironment(iphoneSafari).physicalSafari, true);
assert.equal(api.detectEnvironment(iphoneChrome).physicalSafari, false, "Chrome on iOS must not certify Safari");
assert.equal(api.detectEnvironment(ipadDesktopSafari).physicalSafari, true, "desktop-mode iPad Safari must remain detectable");

function evidence(profile, environment = iphoneSafari, checks = [...api.REQUIRED_CHECKS], physicalConfirmed = true) {
  const orientation = profile === "iphone_landscape" ? "landscape-primary" : "portrait-primary";
  return api.buildEvidence({ profile, environment, checks, physicalConfirmed, orientation, performedAt: "2026-08-14T10:45:00.000Z" });
}
assert.equal(evidence("iphone_portrait").passed, true);
assert.equal(evidence("iphone_portrait", iphoneChrome).passed, false);
assert.equal(evidence("iphone_portrait", iphoneSafari, api.REQUIRED_CHECKS.slice(1)).passed, false);
assert.equal(evidence("iphone_portrait", iphoneSafari, api.REQUIRED_CHECKS, false).passed, false);
assert.equal(evidence("unknown_profile").passed, false);
assert.equal(evidence("ipad_fullscreen", iphoneSafari).passed, false, "an iPhone must not certify an iPad profile");
assert.equal(api.buildEvidence({
  profile: "iphone_landscape",
  environment: iphoneSafari,
  checks: api.REQUIRED_CHECKS,
  physicalConfirmed: true,
  orientation: "portrait-primary"
}).passed, false, "iPhone orientation must match the selected profile");
assert.equal(evidence("iphone_portrait").automatedApproval, false);

const complete = api.summarize(api.REQUIRED_PROFILES.map((profile) => evidence(profile, profile.startsWith("ipad") ? ipadDesktopSafari : iphoneSafari)));
assert.equal(complete.passed, true);
assert.equal(complete.passedProfiles.length, 4);
assert.equal(complete.automatedApproval, false);
const incomplete = api.summarize([evidence("ipad_fullscreen", ipadDesktopSafari)]);
assert.equal(incomplete.passed, false);
assert.deepEqual(Array.from(incomplete.missingProfiles), ["iphone_portrait", "iphone_landscape", "ipad_split_view"]);
const tampered = JSON.parse(JSON.stringify(evidence("iphone_portrait")));
tampered.environment.physicalSafari = false;
assert.equal(api.validStoredEvidence(tampered), false);
assert.equal(api.summarize([tampered]).passedProfiles.length, 0, "tampered imported evidence must not count");
const imported = api.importPayload(
  { version: api.VERSION, records: [evidence("iphone_portrait")] },
  { version: api.VERSION, records: [evidence("ipad_fullscreen", ipadDesktopSafari), tampered] }
);
assert.equal(imported.records.length, 2, "only valid imported records may be merged");

assert.deepEqual(
  JSON.parse(JSON.stringify(api.parseStore("not-json"))),
  { version: "aha_safari_device_evidence_v1", records: [] }
);

console.log("aha-safari-device-evidence-surface.test.cjs passed");
