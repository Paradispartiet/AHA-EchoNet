const assert = require("assert");
const fs = require("fs");

const moduleCss = fs.readFileSync("css/ahaModule.css", "utf8");
const plan = fs.readFileSync("docs/AHA_DESIGN_CONSOLIDATION_V1.md", "utf8");

// Legacy module CSS may style module-local primitives, but the shared AHA shell
// owns page width, centering and outer padding.
assert.doesNotMatch(
  moduleCss,
  /(^|\n)\s*body\s*\{[\s\S]*?\}/,
  "ahaModule.css must not own global body layout"
);

for (const selector of [".module-form", ".module-list", ".module-card", ".module-meta"]) {
  assert.match(moduleCss, new RegExp(selector.replace(".", "\\.")), `${selector} should remain available during controlled migration`);
}

assert.match(plan, /Phase 1 — Shell ownership/, "design plan should record shell consolidation first");
assert.match(plan, /Existing functionality is preserved/, "design plan should preserve runtime behavior during presentation consolidation");

console.log("AHA Design Consolidation V1 shell contract passed.");
