const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = {
  window: {},
  console
};
context.window.window = context.window;
vm.createContext(context);

vm.runInContext(fs.readFileSync(path.join(root, "js/ahaSyncChannelsRegistry.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "js/ahaSyncChannelRouter.js"), "utf8"), context);

const router = context.window.AHASyncChannelRouter;
assert.ok(router, "window.AHASyncChannelRouter should exist");
assert.ok(router.getChannels().length > 0, "router should read AHA_SYNC_CHANNELS");

assert.ok(router.routeText("Hvorfor skjer dette?").matchedChannels.includes("open-questions"));
assert.ok(router.routeText("Jeg er uenig, men ser poenget").matchedChannels.includes("tensions"));
assert.ok(router.routeText("Fra mitt perspektiv ser dette annerledes ut").matchedChannels.includes("perspectives"));
assert.ok(router.routeSourceEvent({ tags: ["demokrati"] }).matchedChannels.includes("concept-links"));
assert.ok(router.routeSourceEvent({ meta: { concepts: ["tillit"] } }).matchedChannels.includes("concept-links"));
assert.ok(router.routeSourceEvent({ conversation_id: "conv_1" }).matchedChannels.includes("conversation-links"));
assert.strictEqual(router.routeSourceEvent(null).matchedChannels.length, 0);

const summary = router.summarizeRoutes([
  { text: "Hva skjer?" },
  { text: "Jeg er uenig" },
  null
]);
assert.strictEqual(summary.total, 3);
assert.strictEqual(summary.byChannel["open-questions"], 1);
assert.strictEqual(summary.byChannel.tensions, 1);
assert.strictEqual(summary.unrouted, 1);
