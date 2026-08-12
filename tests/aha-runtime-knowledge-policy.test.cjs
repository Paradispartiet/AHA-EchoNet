const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const textUtilsCode = fs.readFileSync(path.join(repoRoot, "js/ahaChatTextUtils.js"), "utf8");
const signalsCode = fs.readFileSync(path.join(repoRoot, "js/ahaChatSignals.js"), "utf8");
const exportCode = fs.readFileSync(path.join(repoRoot, "js/ahaChatExport.js"), "utf8");
const autoAnalysisCode = fs.readFileSync(path.join(repoRoot, "js/ahaChatAutoAnalysis.js"), "utf8");
const canonicalAnalysisCode = fs.readFileSync(path.join(repoRoot, "js/ahaChatCanonicalAnalysis.js"), "utf8");
const chatCode = fs.readFileSync(path.join(repoRoot, "js/ahaChat.js"), "utf8");

const windowObj = {};
const sandbox = { window: windowObj, console, Set, Map, WeakSet, Date, JSON, String, Number, Boolean, Array, Object, Math, RegExp };
windowObj.window = windowObj;
vm.runInNewContext(textUtilsCode, sandbox, { filename: "ahaChatTextUtils.js" });
vm.runInNewContext(signalsCode, sandbox, { filename: "ahaChatSignals.js" });
vm.runInNewContext(exportCode, sandbox, { filename: "ahaChatExport.js" });

const evaluationSource = `
Evalueringer i offentlig forvaltning brukes til læring, styring og forbedring. Betydningen av kvalitet og relevans er stor.
Respondentene mener evalueringene bør brukes mer systematisk, og ledelsen bør følge opp funnene.
Formålet med evaluering er økt samfunnsnytte. Deltakende metoder og referansegrupper kan styrke relevansen.
Forvaltningen trenger bedre evalueringer, ikke nødvendigvis flere. Tradisjon og historisk praksis kan påvirke hvordan evaluering brukes.
Evaluering, evalueringer, forvaltningen, respondentene, kvalitet, relevans, samfunnsnytte, oppfølging, styring, metode.
`;

const religious = windowObj.AHAChatSignals.inferReligiousLexiconEvidence(evaluationSource);
assert.equal(religious.strong, false, "betydning/tradisjon must not trigger Pentecost classification");
assert.equal(religious.markers.includes("pinsenarrativ"), false, "tydning must not match inside betydning");

const pentecost = windowObj.AHAChatSignals.inferReligiousLexiconEvidence("Pinse beskriver Den hellige ånd i Apostlenes gjerninger og tungetale.");
assert.equal(pentecost.strong, true, "real Pentecost evidence should still classify as religious");

const topicHooks = windowObj.AHAChatExportTestHooks;
const stalePentecostOutput = "Pinse Den hellige ånd tungetale apostlene Babels tårn kirkens fødselsdag gregoriansk kalender.";
const mismatch = topicHooks.buildTopicConsistencyReport({ sourceText: evaluationSource, outputText: stalePentecostOutput, requiredTerms: [], forbiddenTerms: [] });
assert.equal(mismatch.valid, false);
assert.equal(mismatch.status, "invalid_semantic_topic_mismatch");
assert.equal(mismatch.semanticTopicMismatch, true);

const goodOutput = "Evalueringer i offentlig forvaltning bør brukes mer systematisk. Kvalitet, relevans, samfunnsnytte og oppfølging står sentralt.";
const good = topicHooks.buildTopicConsistencyReport({ sourceText: evaluationSource, outputText: goodOutput, requiredTerms: [], forbiddenTerms: [] });
assert.equal(good.valid, true);
assert.ok(good.meaningfulOverlap.length >= 2);

assert.match(autoAnalysisCode, /durableKnowledgeSource:\s*"fagverk"/);
assert.match(autoAnalysisCode, /currentDocumentRole:\s*"analysis_source"/);
assert.match(autoAnalysisCode, /legacyArticleTemplatesEnabled:\s*false/);
const buildStart = autoAnalysisCode.indexOf("function buildAutoOutputs");
const academicBranch = autoAnalysisCode.indexOf('if (textType === "academic_article" && !AHA_RUNTIME_KNOWLEDGE_POLICY.legacyArticleTemplatesEnabled)', buildStart);
const legacyAcademicBranch = autoAnalysisCode.indexOf('else if (textType === "academic_article")', buildStart);
assert.ok(buildStart >= 0 && academicBranch > buildStart && academicBranch < legacyAcademicBranch, "source-grounded academic early return must precede legacy templates");
assert.match(chatCode, /skip_insight:\s*urlInfo\.isSourceAction \|\| transientAnalysisDocument/);
assert.match(chatCode, /savingEnabled && !urlInfo\.isSourceAction && !transientAnalysisDocument/);
assert.match(canonicalAnalysisCode, /const domain = detectAutoAnalysisDomain\(sourceText \|\| "", safePayload \|\| \{\}\);/);
assert.doesNotMatch(canonicalAnalysisCode, /policyAcademic \? "fagverk_routed_academic"/);
assert.match(canonicalAnalysisCode, /Kildebasert fagkobling fra AHA Fagverk-kalibrering/);

console.log("aha-runtime-knowledge-policy.test.cjs passed");
