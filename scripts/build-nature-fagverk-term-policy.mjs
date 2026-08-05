#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { normalize } from "./lib/nature-fagverk-scoring.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const DEFAULT_CORPUS = "data/integrations/candidates/history-go-fagverk-natur.candidate.v1.json";
const DEFAULT_AUDIT = "data/integrations/candidates/history-go-fagverk-natur.candidate-audit.v1.json";
const DEFAULT_OUTPUT = "data/integrations/review/history-go-fagverk-natur.term-policy.v1.json";

const GENERIC_LANGUAGE_TERMS = new Set(["aktivitet", "analyse", "andre", "bare", "begge", "både", "case", "data", "derfor", "dokumentasjon", "endring", "endringer", "felles", "flere", "fordi", "forklaring", "former", "gir", "gjør", "handler", "hvordan", "kan", "konsekvenser", "krever", "men", "mens", "når", "samlet", "seg", "slik", "system", "systemet", "tekst", "teksten", "tiltak", "ulike", "uten", "utvikling", "viktig", "være", "natur", "miljø", "arter", "art", "mangfold", "vann", "energi", "ressurser", "forvaltning", "historisk", "historie", "lang tid", "byrom", "by", "klima", "landskap", "grønn", "økologi", "biologisk", "organisme", "prosess"]);
const DOMAIN_GATE_TERMS = Object.freeze([
  "artsbestemmelse",
  "taksonomi",
  "plantevev",
  "vegetasjonsanalyse",
  "allelfrekvens",
  "genetisk drift",
  "bergart",
  "platetektonikk",
  "strålingsbalanse",
  "drivhuseffekt",
  "økologisk tilstand",
  "naturrestaurering",
  "næringsnett",
  "habitatkvalitet",
  "homeostase",
  "osmoregulering",
  "urban økologi",
  "grønnstruktur",
  "nedbørfelt",
  "hydrologi",
  "zoologi",
  "fauna"
]);
const CHAPTER_RULES = Object.freeze({
  "artskunnskap_systematikk": {
    "required_anchor_terms": [
      "artsbestemmelse",
      "taksonomi",
      "bestemmelsesnøkkel",
      "nomenklatur",
      "fylogenetisk tre"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "diagnostiske artskjennetegn",
        "weight": 4
      },
      {
        "term": "morfologisk nøkkelbestemmelse",
        "weight": 4
      },
      {
        "term": "taksonomisk rang",
        "weight": 4
      },
      {
        "term": "referansebelegg for art",
        "weight": 4
      },
      {
        "term": "integrativ taksonomi",
        "weight": 4
      }
    ]
  },
  "botanikk_vegetasjon": {
    "required_anchor_terms": [
      "plantevev",
      "vegetasjonsanalyse",
      "xylem",
      "floem",
      "herbariebelegg"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "plantecelle og vev",
        "weight": 4
      },
      {
        "term": "xylem og floem",
        "weight": 4
      },
      {
        "term": "vegetasjonsrute",
        "weight": 4
      },
      {
        "term": "plantefysiologisk prosess",
        "weight": 4
      },
      {
        "term": "herbariedokumentasjon",
        "weight": 4
      }
    ]
  },
  "evolusjon_biologisk_mangfold": {
    "required_anchor_terms": [
      "allelfrekvens",
      "genetisk drift",
      "genflyt",
      "reproduktiv isolasjon",
      "naturlig seleksjon"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "endring i allelfrekvens",
        "weight": 4
      },
      {
        "term": "populasjonsgenetisk prosess",
        "weight": 4
      },
      {
        "term": "reproduktiv barriere",
        "weight": 4
      },
      {
        "term": "evolusjonær tilpasning",
        "weight": 4
      },
      {
        "term": "historisk biogeografi",
        "weight": 4
      }
    ]
  },
  "geologi_landskap_tid": {
    "required_anchor_terms": [
      "bergart",
      "platetektonikk",
      "erosjon",
      "sediment",
      "kvartærgeologi"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "geologisk tidsdybde",
        "weight": 4
      },
      {
        "term": "berggrunn og løsmasser",
        "weight": 4
      },
      {
        "term": "glasial landskapsforming",
        "weight": 4
      },
      {
        "term": "sedimentær avsetning",
        "weight": 4
      },
      {
        "term": "tektonisk prosess",
        "weight": 4
      }
    ]
  },
  "klima_energi_resiliens": {
    "required_anchor_terms": [
      "strålingsbalanse",
      "drivhuseffekt",
      "klimasystem",
      "karbonkretsløp",
      "klimaresiliens"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "jordens strålingsbalanse",
        "weight": 4
      },
      {
        "term": "atmosfærisk drivhuseffekt",
        "weight": 4
      },
      {
        "term": "tilbakekobling i klimasystemet",
        "weight": 4
      },
      {
        "term": "karbonbudsjett og kretsløp",
        "weight": 4
      },
      {
        "term": "klimatisk motstandskraft",
        "weight": 4
      }
    ]
  },
  "miljopavirkning_forvaltning_regenerasjon": {
    "required_anchor_terms": [
      "økologisk tilstand",
      "naturrestaurering",
      "naturforvaltning",
      "regenerasjon",
      "miljøpåvirkning"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "målt økologisk tilstand",
        "weight": 4
      },
      {
        "term": "restaurering av natur",
        "weight": 4
      },
      {
        "term": "adaptiv naturforvaltning",
        "weight": 4
      },
      {
        "term": "regenerativt miljøtiltak",
        "weight": 4
      },
      {
        "term": "påvirkningsfaktor i natur",
        "weight": 4
      }
    ]
  },
  "okosystem_mangfold_habitat": {
    "required_anchor_terms": [
      "næringsnett",
      "habitatkvalitet",
      "økosystem",
      "biologisk mangfold",
      "populasjonsdynamikk"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "økologisk næringsnett",
        "weight": 4
      },
      {
        "term": "målt habitatkvalitet",
        "weight": 4
      },
      {
        "term": "populasjon og bestand",
        "weight": 4
      },
      {
        "term": "økosystemets funksjon",
        "weight": 4
      },
      {
        "term": "biologisk artsmangfold",
        "weight": 4
      }
    ]
  },
  "organismebiologi_fysiologi": {
    "required_anchor_terms": [
      "homeostase",
      "osmoregulering",
      "celleånding",
      "sirkulasjon",
      "organfysiologi"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "fysiologisk homeostase",
        "weight": 4
      },
      {
        "term": "respirasjon og gassutveksling",
        "weight": 4
      },
      {
        "term": "osmotisk regulering",
        "weight": 4
      },
      {
        "term": "sirkulasjonssystemets funksjon",
        "weight": 4
      },
      {
        "term": "organismens energibalanse",
        "weight": 4
      }
    ]
  },
  "urban_okologi_gronnstruktur": {
    "required_anchor_terms": [
      "urban økologi",
      "grønnstruktur",
      "blågrønn struktur",
      "økologisk korridor",
      "overvannsinfiltrasjon"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "økologisk grønnstruktur i by",
        "weight": 4
      },
      {
        "term": "blågrønn overvannsløsning",
        "weight": 4
      },
      {
        "term": "urban habitatkonnektivitet",
        "weight": 4
      },
      {
        "term": "infiltrasjon i byjord",
        "weight": 4
      },
      {
        "term": "økologisk korridor i bylandskap",
        "weight": 4
      }
    ]
  },
  "vann_hydrologi_kretslop": {
    "required_anchor_terms": [
      "nedbørfelt",
      "avrenning",
      "grunnvann",
      "hydrologi",
      "vannføring"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "hydrologisk nedbørfelt",
        "weight": 4
      },
      {
        "term": "målt vannføring",
        "weight": 4
      },
      {
        "term": "grunnvannsmagasin",
        "weight": 4
      },
      {
        "term": "overflateavrenning",
        "weight": 4
      },
      {
        "term": "vannets kretsløp",
        "weight": 4
      }
    ]
  },
  "zoologi_dyreliv": {
    "required_anchor_terms": [
      "zoologi",
      "fauna",
      "virveldyr",
      "virvelløse dyr",
      "dyreatferd"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "zoologisk artsgruppe",
        "weight": 4
      },
      {
        "term": "dyrenes atferdsøkologi",
        "weight": 4
      },
      {
        "term": "virveldyr og virvelløse",
        "weight": 4
      },
      {
        "term": "faunistisk kartlegging",
        "weight": 4
      },
      {
        "term": "dyreorganismens levevis",
        "weight": 4
      }
    ]
  }
});

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
  return [
    ...(audit.high_risk_terms || []),
    ...(audit.medium_risk_terms || []),
    ...(audit.low_risk_terms || [])
  ];
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
  if (corpus.subject_filter !== "natur") throw new Error("Corpus is not Nature-scoped.");
  if (audit.subject_filter?.[0] !== "natur") throw new Error("Audit is not Nature-scoped.");
  if (corpus.source_ref !== audit.source_ref) throw new Error("Nature corpus and audit source refs differ.");
  if (corpus.entries.length !== 11) throw new Error("Nature corpus must contain 11 chapters.");
  if (audit.coverage?.materialized !== 11 || audit.coverage?.missing?.length) throw new Error("Nature audit coverage is incomplete.");
  const reviewed = reviewedTerms();
  const terms = collisionRows(audit).map((item) => {
    const term = normalize(item.term);
    if (reviewed.has(term)) {
      return {
        term,
        risk: item.risk,
        chapter_count: item.chapter_count,
        category: "reviewed_chapter_scoped_evidence",
        action: "chapter_scoped",
        multiplier: 1
      };
    }
    if (GENERIC_LANGUAGE_TERMS.has(term) || item.risk === "high") {
      return {
        term,
        risk: item.risk,
        chapter_count: item.chapter_count,
        category: GENERIC_LANGUAGE_TERMS.has(term) ? "generic_language" : "high_risk_collision",
        action: "non_scoring",
        multiplier: 0
      };
    }
    if (item.risk === "medium") {
      return {
        term,
        risk: item.risk,
        chapter_count: item.chapter_count,
        category: "medium_risk_collision",
        action: "down_weight",
        multiplier: 0.3
      };
    }
    return {
      term,
      risk: item.risk,
      chapter_count: item.chapter_count,
      category: "low_risk_shared_phrase",
      action: "context_only",
      multiplier: 0
    };
  }).sort((a, b) => a.term.localeCompare(b.term, "nb"));

  const actionCounts = Object.fromEntries(["non_scoring", "down_weight", "context_only", "chapter_scoped"].map(
    (action) => [action, terms.filter((item) => item.action === action).length]
  ));
  return {
    schema: "aha_nature_fagverk_term_policy_v1",
    version: "1.0.0",
    status: "review_policy_full_fixture_candidate_not_runtime_active",
    lifecycle_stage: "subject_release_review",
    subject_id: "natur",
    source_repo: corpus.source_repo,
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    thresholds: {
      minimum_score: 7,
      minimum_terms: 2,
      ambiguity_margin: 3
    },
    default_weights: {
      title_term: 5,
      concept_term: 3,
      support_term: 1.5,
      supplemental_evidence_term: 4,
      down_weight_multiplier: 0.3
    },
    policy_rules: {
      high_risk: "non_scoring",
      medium_risk: "down_weight_unless_reviewed_chapter_evidence",
      low_risk_shared_phrase: "context_only",
      generic_language: "non_scoring",
      nature_domain_anchor: "required_for_every_nature_selection",
      chapter_anchor: "required_for_every_chapter",
      supplemental_evidence: "chapter_scoped_only"
    },
    domain_gate: {
      required: true,
      terms: DOMAIN_GATE_TERMS
    },
    global_non_scoring_terms: [...GENERIC_LANGUAGE_TERMS].sort((a, b) => a.localeCompare(b, "nb")),
    chapter_rules: CHAPTER_RULES,
    terms,
    chapters: corpus.entries.map((entry) => ({
      chapter_id: entry.chapter_id,
      title: entry.title,
      module_file_count: (entry.module_source_paths || []).length,
      required_anchor_count: CHAPTER_RULES[entry.chapter_id]?.required_anchor_terms?.length || 0,
      supplemental_evidence_count: CHAPTER_RULES[entry.chapter_id]?.supplemental_evidence_terms?.length || 0
    })),
    summary: {
      total: audit.term_collision_summary.total,
      risks: {
        high: audit.term_collision_summary.high_risk,
        medium: audit.term_collision_summary.medium_risk,
        low: audit.term_collision_summary.low_risk
      },
      actions: actionCounts,
      chapter_count: corpus.entries.length,
      module_file_count: corpus.entries.reduce((sum, entry) => sum + (entry.module_source_paths || []).length, 0)
    },
    approval_required: true,
    runtime_activation_allowed: false,
    explicit_runtime_activation_pull_request_required: true
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-nature-fagverk-term-policy.mjs [--corpus path] [--audit path] [--output path]");
    return;
  }
  const policy = buildPolicy(readJson(args.corpus), readJson(args.audit));
  writeJson(args.output, policy);
  console.log(`Nature term policy: ${policy.summary.total} collisions, ${policy.summary.chapter_count} chapters, runtime inactive.`);
}

main();
