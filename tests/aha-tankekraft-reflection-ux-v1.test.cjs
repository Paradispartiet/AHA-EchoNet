const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "profile.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/aha-personal-surfaces.css"), "utf8");
assert.match(html, /<h2>Tankekraft<\/h2>/);
assert.match(html, /Dette måler ikke intelligensen din/);
assert.match(html, /Spørsmål du kan bruke uten AI/);
assert.match(html, /Hva vet jeg faktisk ut fra materialet/);
assert.match(html, /Hvilken annen forklaring kan være mulig/);
assert.match(html, /Hva vil jeg undersøke neste gang/);
assert.match(html, /href="insights.html">Utforsk innsikter/);
assert.match(css, /aha-reflection-tech/);

const stored = new Map();
stored.set("aha_insight_chamber_v1", JSON.stringify({ insights: [
  { id: "ins-1", theme: "Natur", concepts: [{ label: "byrom" }] },
  { id: "ins-2", theme: "Steder", concepts: [{ label: "fokus" }] }
]}));
let writes = 0;
const panel = { innerHTML: "", onclick: null };
const context = {
  console, Date, Math, JSON, Intl,
  localStorage: {
    getItem(key) { return stored.get(key) ?? null; },
    setItem() { writes++; throw Error("Tankekraft must not write during render"); }
  },
  document: {
    readyState: "loading",
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById(id) { return id === "aha-meta-profile-home" ? panel : null; }
  },
  fetch() { throw Error("Tankekraft must not fetch"); },
  location: { href: "profile.html" },
  MetaInsightsEngine: {
    buildUserMetaProfile() {
      return {
        meta_insight: {
          summary: "En mulig observasjon: <script>bad</script>",
          readiness: { level: "middels", score: 42 },
          evidence: { insight_count: 2 },
          learning_mode: "utforsker",
          dominant_themes: [{ theme_id: "Natur", insight_count: 2 }],
          next_actions: ["Sjekk et moteksempel"]
        },
        recommendations: {
          unstick_prompts: [{ prompt: "Hva kan forklare <b>andre</b> mønstre?" }]
        }
      };
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "js/ahaProfile.js"), "utf8"), context, { filename: "js/ahaProfile.js" });
context.AHAProfile.render();
const rendered = panel.innerHTML;
assert.match(rendered, /Mulige mønstre i materialet/);
assert.match(rendered, /Det er forslag til refleksjon/);
assert.match(rendered, /Mulig arbeidsmønster i materialet/);
assert.match(rendered, /Spørsmål å tenke videre på/);
assert.match(rendered, /Ta med som spørsmål i Chat/);
assert.match(rendered, /<details class="aha-reflection-tech">/);
assert.match(rendered, /Intern beredskapsindikator: middels \(42\/100\)/);
assert.match(rendered, /ikke en score for intelligens/);
assert.doesNotMatch(rendered.split('<details class="aha-reflection-tech">')[0], /42\/100|<script>/);
assert.doesNotMatch(rendered, /<script>|<b>andre<\/b>/);
assert.match(rendered, /&lt;script&gt;/);
assert.equal(writes, 0, "render must remain read-only");
console.log("Tankekraft UX: real Meta material, provisional language, hidden technical score, escaped data and no writes passed.");
