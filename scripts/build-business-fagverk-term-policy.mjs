#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { normalize } from "./lib/business-fagverk-scoring.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const DEFAULT_CORPUS = "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json";
const DEFAULT_AUDIT = "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate-audit.v1.json";
const DEFAULT_OUTPUT = "data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json";

const GENERIC_LANGUAGE_TERMS = new Set([
  "aktivitet", "analyse", "andre", "ansvar", "arbeid", "bare", "bedrift", "begge", "både", "case", "data",
  "derfor", "dokumentasjon", "endring", "endringer", "felles", "flere", "fordi", "forklaring", "former", "gir",
  "gjør", "handel", "handler", "hvordan", "kan", "kapital", "konsekvenser", "krever", "kunde", "kunder", "marked",
  "markeder", "men", "mens", "måling", "når", "organisasjon", "pris", "priser", "produksjon", "prosjekt", "ressurser",
  "risiko", "samlet", "seg", "slik", "strategi", "system", "systemet", "teknologi", "tekst", "teksten", "tiltak",
  "ulike", "uten", "utvikling", "verdi", "virksomhet", "viktig", "være", "økonomi", "økonomisk"
]);

export const CHAPTER_RULES = Object.freeze({
  "arbeid-produksjon-verdiskaping": {
    required_anchor_terms: ["arbeidskraftproduktivitet", "bruttoprodukt", "kapasitetsutnyttelse", "reallønn", "lønnsandel"],
    supplemental_evidence_terms: [
      { term: "produksjonsverdi fratrukket produktinnsats", weight: 4 },
      { term: "faktisk utførte timeverk", weight: 4 },
      { term: "automatisering av arbeidsoppgaver", weight: 4 },
      { term: "verdiskaping per arbeidstime", weight: 4 },
      { term: "lønnens andel av verdiskapingen", weight: 4 }
    ]
  },
  "forretningsjus-skatt-compliance": {
    required_anchor_terms: ["avtaleinngåelse", "selskapsstyring", "arbeidsrett", "merverdiavgift", "compliance"],
    supplemental_evidence_terms: [
      { term: "juridisk faktummatrise", weight: 4 },
      { term: "dokumentert skattegrunnlag", weight: 4 },
      { term: "styrets rettslige ansvar", weight: 4 },
      { term: "misligholdsbeføyelser i avtalen", weight: 4 },
      { term: "behandling av personopplysninger", weight: 4 }
    ]
  },
  "handel-forbruk-marked": {
    required_anchor_terms: ["markedsavgrensning", "førpris", "prisindeks", "markedsandel", "betalingsinstrument"],
    supplemental_evidence_terms: [
      { term: "produktmarked og geografisk marked", weight: 4 },
      { term: "dokumentert sammenligningspris", weight: 4 },
      { term: "omsetning skilt fra salgsvolum", weight: 4 },
      { term: "kundesubstitusjon i markedet", weight: 4 },
      { term: "totalpris og kontraktsvilkår", weight: 4 }
    ]
  },
  "internasjonal-okonomi-operations-prosjekt": {
    required_anchor_terms: ["valutakurs", "komparative fortrinn", "flaskehals", "sikkerhetslager", "kritisk linje"],
    supplemental_evidence_terms: [
      { term: "valutaeksponering i verdikjeden", weight: 4 },
      { term: "little’s law i prosessflyten", weight: 4 },
      { term: "total cost of ownership", weight: 4 },
      { term: "opptjent verdi i prosjektet", weight: 4 },
      { term: "leverandørvalg og forsyningsrisiko", weight: 4 }
    ]
  },
  "kapital-eierskap-finans": {
    required_anchor_terms: ["egenkapital", "gjeldsgrad", "nåverdi", "kapitalkostnad", "kontantstrøm"],
    supplemental_evidence_terms: [
      { term: "diskontert fri kontantstrøm", weight: 4 },
      { term: "vektet kapitalkostnad", weight: 4 },
      { term: "eierandel og stemmerett", weight: 4 },
      { term: "likviditetsrisiko og soliditet", weight: 4 },
      { term: "nåverdi av investeringen", weight: 4 }
    ]
  },
  "kvantitative-metoder-business-analytics": {
    required_anchor_terms: ["regresjonsanalyse", "konfidensintervall", "kausalitet", "utvalgsbias", "prognosefeil"],
    supplemental_evidence_terms: [
      { term: "estimat med usikkerhetsintervall", weight: 4 },
      { term: "korrelasjon er ikke kausal effekt", weight: 4 },
      { term: "treningsdata og testdata", weight: 4 },
      { term: "sensitivitetsanalyse av modellen", weight: 4 },
      { term: "målefeil og seleksjonsbias", weight: 4 }
    ]
  },
  "logistikk-infrastruktur-okonomisk-rom": {
    required_anchor_terms: ["transportkostnad", "knutepunkt", "lagerbinding", "ledetid", "verdikjede"],
    supplemental_evidence_terms: [
      { term: "dør til dør-ledetid", weight: 4 },
      { term: "lagerets kapitalbinding", weight: 4 },
      { term: "transportnettets flaskehals", weight: 4 },
      { term: "lokalisering og markedsadgang", weight: 4 },
      { term: "vareflyt gjennom logistikkleddene", weight: 4 }
    ]
  },
  "makrookonomi-konjunkturer-okonomisk-politikk": {
    required_anchor_terms: ["bruttonasjonalprodukt", "produksjonsgap", "styringsrente", "konsumprisindeks", "arbeidsledighet"],
    supplemental_evidence_terms: [
      { term: "realvekst i bruttonasjonalprodukt", weight: 4 },
      { term: "sesongjustert arbeidsledighet", weight: 4 },
      { term: "inflasjon målt med konsumprisindeks", weight: 4 },
      { term: "finanspolitisk impuls", weight: 4 },
      { term: "pengepolitikk gjennom styringsrenten", weight: 4 }
    ]
  },
  "makt-regulering-baerekraft": {
    required_anchor_terms: ["eksternalitet", "markedsmakt", "reguleringssvikt", "dobbel vesentlighet", "naturkapital"],
    supplemental_evidence_terms: [
      { term: "negativ eksternalitet utenfor prisen", weight: 4 },
      { term: "konsentrasjon og dokumentert markedsmakt", weight: 4 },
      { term: "reguleringens fordelingsvirkning", weight: 4 },
      { term: "dobbel vesentlighetsanalyse", weight: 4 },
      { term: "verdikjedens klima- og naturpåvirkning", weight: 4 }
    ]
  },
  "markedsforing-strategi-kunder": {
    required_anchor_terms: ["kundesegment", "posisjonering", "konverteringsrate", "kundelivstidsverdi", "attribusjon"],
    supplemental_evidence_terms: [
      { term: "segmentering etter dokumentert kundebehov", weight: 4 },
      { term: "posisjonering mot et definert alternativ", weight: 4 },
      { term: "kundelivstidsverdi og anskaffelseskostnad", weight: 4 },
      { term: "eksperimentell måling av konvertering", weight: 4 },
      { term: "attribusjon mellom markedskanaler", weight: 4 }
    ]
  },
  "regnskap-revisjon-okonomistyring": {
    required_anchor_terms: ["periodisering", "balanseføring", "kontantstrømoppstilling", "revisjonsbevis", "dekningsbidrag"],
    supplemental_evidence_terms: [
      { term: "periodisert inntekt og kostnad", weight: 4 },
      { term: "avstemming mellom resultat og kontantstrøm", weight: 4 },
      { term: "tilstrekkelig og hensiktsmessig revisjonsbevis", weight: 4 },
      { term: "dekningsbidrag per flaskehalsenhet", weight: 4 },
      { term: "budsjettavvik med pris- og volumeffekt", weight: 4 }
    ]
  },
  "teknologi-innovasjon-plattformer": {
    required_anchor_terms: ["nettverkseffekt", "plattformøkonomi", "byttkostnad", "innovasjonsportefølje", "skalering"],
    supplemental_evidence_terms: [
      { term: "tosidig marked med nettverkseffekt", weight: 4 },
      { term: "plattformens styringsregler", weight: 4 },
      { term: "brukerens byttkostnad", weight: 4 },
      { term: "innovasjonsportefølje med opsjoner", weight: 4 },
      { term: "skalering uten tilsvarende marginalkostnad", weight: 4 }
    ]
  }
});

const DOMAIN_GATE_TERMS = Object.freeze([...new Set(Object.values(CHAPTER_RULES).flatMap((rule) => rule.required_anchor_terms))]);

function parseArgs(argv) {
  const args = { corpus: DEFAULT_CORPUS, audit: DEFAULT_AUDIT, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--corpus") args.corpus = argv[++index] || args.corpus;
    else if (token === "--audit") args.audit = argv[++index] || args.audit;
    else if (token === "--output") args.output = argv[++index] || args.output;
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  const outputPath = path.resolve(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function collisionRows(audit) {
  return [...(audit.high_risk_terms || []), ...(audit.medium_risk_terms || []), ...(audit.low_risk_terms || [])];
}

function reviewedTerms() {
  const terms = new Set(DOMAIN_GATE_TERMS.map(normalize));
  for (const rule of Object.values(CHAPTER_RULES)) {
    for (const term of rule.required_anchor_terms || []) terms.add(normalize(term));
    for (const item of rule.supplemental_evidence_terms || []) terms.add(normalize(item.term));
  }
  return terms;
}

function buildPolicy(corpus, audit) {
  if (corpus.subject_filter !== "naeringsliv") throw new Error("Corpus is not Business-scoped.");
  if (audit.subject_filter?.[0] !== "naeringsliv") throw new Error("Audit is not Business-scoped.");
  if (corpus.source_ref !== audit.source_ref) throw new Error("Business corpus and audit source refs differ.");
  if (corpus.entries.length !== 12) throw new Error("Business corpus must contain 12 chapters.");
  if (audit.coverage?.materialized !== 12 || audit.coverage?.missing?.length) throw new Error("Business audit coverage is incomplete.");
  const moduleFileCount = corpus.entries.reduce((sum, entry) => sum + (entry.module_source_paths || []).length, 0);
  if (moduleFileCount !== 36) throw new Error(`Business corpus must contain 36 module files, got ${moduleFileCount}.`);
  const expectedIds = Object.keys(CHAPTER_RULES).sort((a, b) => a.localeCompare(b, "nb"));
  const actualIds = corpus.entries.map((entry) => entry.chapter_id).sort((a, b) => a.localeCompare(b, "nb"));
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) throw new Error("Business chapter rules do not exactly match the corpus.");

  const reviewed = reviewedTerms();
  const terms = collisionRows(audit).map((item) => {
    const term = normalize(item.term);
    if (reviewed.has(term)) {
      return { term, risk: item.risk, chapter_count: item.chapter_count, category: "reviewed_chapter_scoped_evidence", action: "chapter_scoped", multiplier: 1 };
    }
    if (GENERIC_LANGUAGE_TERMS.has(term) || item.risk === "high") {
      return { term, risk: item.risk, chapter_count: item.chapter_count, category: GENERIC_LANGUAGE_TERMS.has(term) ? "generic_language" : "high_risk_collision", action: "non_scoring", multiplier: 0 };
    }
    if (item.risk === "medium") {
      return { term, risk: item.risk, chapter_count: item.chapter_count, category: "medium_risk_collision", action: "down_weight", multiplier: 0.3 };
    }
    return { term, risk: item.risk, chapter_count: item.chapter_count, category: "low_risk_shared_phrase", action: "context_only", multiplier: 0 };
  }).sort((a, b) => a.term.localeCompare(b.term, "nb"));

  return {
    schema: "aha_business_fagverk_term_policy_v1",
    version: "1.0.0",
    status: "review_policy_full_fixture_candidate_not_runtime_active",
    subject_id: "naeringsliv",
    source_repo: corpus.source_repo,
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    thresholds: { minimum_score: 7, minimum_terms: 2, ambiguity_margin: 3 },
    default_weights: { title_term: 5, concept_term: 3, support_term: 1.5, supplemental_evidence_term: 4, down_weight_multiplier: 0.3 },
    policy_rules: {
      high_risk: "non_scoring",
      medium_risk: "down_weight_unless_reviewed_chapter_evidence",
      low_risk_shared_phrase: "context_only",
      generic_language: "non_scoring",
      business_domain_anchor: "required_for_every_business_selection",
      chapter_anchor: "required_for_every_chapter",
      supplemental_evidence: "chapter_scoped_only"
    },
    summary: {
      total: terms.length,
      risks: {
        high: terms.filter((item) => item.risk === "high").length,
        medium: terms.filter((item) => item.risk === "medium").length,
        low: terms.filter((item) => item.risk === "low").length
      },
      chapter_count: corpus.entries.length,
      module_file_count: moduleFileCount
    },
    terms,
    global_non_scoring_terms: [...GENERIC_LANGUAGE_TERMS].sort((a, b) => a.localeCompare(b, "nb")),
    domain_gate: { required: true, terms: DOMAIN_GATE_TERMS },
    chapter_rules: CHAPTER_RULES,
    chapters: corpus.entries.map((entry) => ({
      chapter_id: entry.chapter_id,
      title: entry.title,
      required_anchor_terms: CHAPTER_RULES[entry.chapter_id].required_anchor_terms,
      supplemental_evidence_terms: CHAPTER_RULES[entry.chapter_id].supplemental_evidence_terms,
      module_file_count: (entry.module_source_paths || []).length
    })),
    approval_required: true,
    runtime_activation_allowed: false,
    explicit_runtime_activation_pull_request_required: true
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-business-fagverk-term-policy.mjs [--corpus path] [--audit path] [--output path]");
    return;
  }
  const policy = buildPolicy(readJson(args.corpus), readJson(args.audit));
  writeJson(args.output, policy);
  console.log(`Business term policy: ${policy.summary.total} collisions, ${policy.summary.chapter_count} chapters, runtime inactive.`);
}

main();
