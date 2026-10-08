const assert = require("assert");
const fs = require("fs");

const css = fs.readFileSync("css/aha-ai-surfaces.css", "utf8");
const training = fs.readFileSync("training.html", "utf8");
const personal = fs.readFileSync("personal-ai.html", "utf8");

for (const [name, html, pageClass] of [
  ["Training", training, "aha-training-page"],
  ["Personal AI", personal, "aha-personal-ai-page"]
]) {
  assert.match(html, /css\/aha-ai-surfaces\.css/, `${name} should load the shared AI presentation layer`);
  assert.match(html, /aha-ai-surface/, `${name} should opt into the shared AI shell`);
  assert.match(html, /aha-ai-hero/, `${name} should use the flattened AI hero`);
  assert.match(html, new RegExp(pageClass), `${name} should expose its semantic page class`);
}

assert.match(css, /\.aha-training-page\s*\{[^}]*--ai-accent:\s*var\(--aha-color-blue\)/s, "Training should use blue as its primary accent");
assert.match(css, /\.aha-personal-ai-page\s*\{[^}]*--ai-accent:\s*var\(--aha-color-violet\)/s, "Personal AI should use violet as its primary accent");
assert.match(css, /\.aha-ai-surface \.aha-training-stats\s*\{[^}]*display:\s*grid;/s, "AI status counters should use the shared responsive grid");
assert.match(css, /\.aha-ai-surface \.aha-mini-stat::before\s*\{[^}]*background:\s*var\(--ai-accent\)/s, "AI stat cards should carry their page accent");
assert.match(css, /\.aha-training-control-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,/s, "Training controls should use a responsive control grid");
assert.match(css, /\.aha-training-page \.aha-training-review-action\s*\{[^}]*aha-color-cyan-soft/s, "Training review actions should be visually distinct");
assert.match(css, /\.aha-training-page \.aha-training-eval-action\s*\{[^}]*aha-color-violet-soft/s, "Training evaluation actions should be visually distinct");
assert.match(css, /\.aha-training-page \.aha-training-export-action\s*\{[^}]*aha-color-accent-soft/s, "Training export should keep a restrained AHA yellow identity");
assert.match(css, /\.aha-personal-ai-self-panel\s*\{[^}]*rgba\(88,217,199,.17\)/s, "Personal AI self-model should use the cyan semantic surface");
assert.match(css, /\.aha-ai-advanced\s*\{[^}]*rgba\(170,145,247,.03\)/s, "advanced AI controls should remain visually secondary");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.aha-training-control-grid\s*\{[^}]*grid-template-columns:\s*1fr;/, "Training controls should collapse on mobile");

for (const phrase of [
  "lokalt corpus og lokale examples",
  "Det trener ikke en modell",
  "Ingen opplasting eller modelltrening",
  "JSONL-eksport er lokal"
]) {
  assert.ok(training.includes(phrase), `Training boundary copy should preserve: ${phrase}`);
}

for (const id of [
  "training-import-btn",
  "training-intake-import-btn",
  "training-curation-import-btn",
  "training-generate-btn",
  "training-export-btn",
  "training-retrieval-btn",
  "training-semantic-retrieval-btn",
  "training-ai-loop-audit-btn",
  "training-answer-composer-btn",
  "training-answer-evaluation-btn",
  "training-corpus-list",
  "training-examples-list"
]) {
  assert.match(training, new RegExp(`id="${id}"`), `Training should preserve runtime control #${id}`);
}

for (const phrase of [
  "lokal kontroll- og testflate",
  "trener ikke en modell og kaller ikke backend",
  "ikke et bevis på at en personlig modell er trent",
  "Retrieval-indekser er lokale"
]) {
  assert.ok(personal.includes(phrase), `Personal AI boundary copy should preserve: ${phrase}`);
}

const advancedIndex = personal.indexOf('id="personal-ai-advanced"');
assert.ok(advancedIndex >= 0, "Personal AI should retain its advanced section");
for (const needle of [
  'data-personal-ai-action="build_retrieval_index"',
  'data-personal-ai-action="build_semantic_index"',
  'data-personal-ai-action="run_ai_loop_audit"',
  'data-personal-ai-action="test_answer_composer"',
  'data-personal-ai-action="test_answer_evaluation"',
  'data-personal-ai-action="full_control_test"',
  'id="personal-ai-modules"',
  'id="personal-ai-result"'
]) {
  assert.ok(personal.indexOf(needle) > advancedIndex, `${needle} should remain inside the advanced Personal AI section`);
}

for (const id of [
  "personal-ai-experience",
  "personal-ai-self-knowledge",
  "personal-ai-self-knowledge-status",
  "personal-ai-overall",
  "personal-ai-recommendations",
  "personal-ai-advanced"
]) {
  assert.match(personal, new RegExp(`id="${id}"`), `Personal AI should preserve runtime mount #${id}`);
}

for (const jsPath of [
  "js/ahaTrainingDashboard.js",
  "js/ahaPersonalAiControl.js",
  "js/ahaPersonalAiDashboard.js",
  "js/ahaPersonalAiSelfKnowledge.js"
]) {
  const js = fs.readFileSync(jsPath, "utf8");
  assert.doesNotMatch(js, /aha-ai-surfaces/, `${jsPath} should remain presentation-agnostic`);
}

console.log("AHA Training/Personal AI polish V1 contract passed.");
