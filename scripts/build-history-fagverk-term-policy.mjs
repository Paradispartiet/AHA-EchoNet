#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { normalize } from "./lib/history-fagverk-scoring.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const DEFAULT_CORPUS = "data/integrations/candidates/history-go-fagverk-historie.candidate.v1.json";
const DEFAULT_AUDIT = "data/integrations/candidates/history-go-fagverk-historie.candidate-audit.v1.json";
const DEFAULT_OUTPUT = "data/integrations/review/history-go-fagverk-historie.term-policy.v1.json";

const GENERIC_LANGUAGE_TERMS = new Set(["aktivitet", "alene", "alternativ", "alternativer", "analyse", "analysen", "andre", "aktør", "aktører", "bare", "beskriver", "beskrives", "begge", "både", "case", "data", "derfor", "dokumentasjon", "dokumentere", "dokumenterer", "endring", "endringer", "ett", "faktisk", "felles", "flere", "fordi", "forklaring", "forklaringer", "former", "før", "følger", "får", "gjennomføring", "gjennomføres", "gir", "gjør", "handler", "historie", "historien", "historisk", "historiske", "hvem", "hvor", "hvorfor", "hvilken", "hvordan", "i perioder", "institusjon", "institusjoner", "institusjonene", "kan", "kilden", "kilder", "konsekvenser", "konkret", "krever", "ledd", "men", "mennesker", "mer", "mens", "mål", "når", "offentlig", "over", "over tid", "periode", "perioder", "produserte", "ressurs", "ressurser", "saken", "samlet", "seg", "senere", "slik", "skill", "skille", "skiller", "staten", "sted", "stedet", "system", "systemet", "systemer", "tekst", "teksten", "tid", "tidsrom", "tidligere", "tiltak", "tiltaket", "tolkning", "underbygges", "undersøker", "ulike", "uten", "utvikling", "utfall", "var", "vedtak", "viser", "viktig", "være", "forstå"]);
const REVIEWED_COLLISION_OVERRIDES = new Map([
  ["hushold", { category: "reviewed_chapter_scoped_evidence", action: "down_weight", multiplier: 0.3 }],
  ["historiebruk", { category: "reviewed_chapter_scoped_evidence", action: "down_weight", multiplier: 0.3 }],
  ["diaspora", { category: "reviewed_chapter_scoped_evidence", action: "down_weight", multiplier: 0.3 }]
]);
const CHAPTER_RULES = Object.freeze({
  "1814_statsdannelse": {
    "required_anchor_terms": [
      "1814",
      "eidsvoll",
      "grunnloven",
      "statsdannelse",
      "1905"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "eidsvoll",
        "weight": 4
      },
      {
        "term": "grunnloven av 1814",
        "weight": 4
      },
      {
        "term": "embetsstat",
        "weight": 4
      },
      {
        "term": "formannskapslovene",
        "weight": 4
      },
      {
        "term": "unionsoppløsning",
        "weight": 4
      }
    ]
  },
  "byhistorie_stedsendring": {
    "required_anchor_terms": [
      "byfornyelse",
      "gentrifisering",
      "byutvidelse",
      "ombygging",
      "urban morfologi",
      "stedsendring"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "byfornyelse",
        "weight": 4
      },
      {
        "term": "gentrifisering",
        "weight": 4
      },
      {
        "term": "urban morfologi",
        "weight": 4
      },
      {
        "term": "ombygging",
        "weight": 4
      },
      {
        "term": "byutvikling",
        "weight": 4
      },
      {
        "term": "stadion",
        "weight": 4
      }
    ]
  },
  "forhistorie_arkeologi": {
    "required_anchor_terms": [
      "arkeologi",
      "stratigrafi",
      "typologi",
      "radiokarbondatering",
      "funnkontekst",
      "forhistorie"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "stratigrafi",
        "weight": 4
      },
      {
        "term": "radiokarbondatering",
        "weight": 4
      },
      {
        "term": "funnkontekst",
        "weight": 4
      },
      {
        "term": "typologi",
        "weight": 4
      },
      {
        "term": "arkeologisk lag",
        "weight": 4
      }
    ]
  },
  "forste_verdenskrig_mellomkrig": {
    "required_anchor_terms": [
      "første verdenskrig",
      "mellomkrigstiden",
      "skyttergravskrig",
      "versaillestraktaten",
      "fascisme",
      "økonomisk krise"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "skyttergravskrig",
        "weight": 4
      },
      {
        "term": "versaillestraktaten",
        "weight": 4
      },
      {
        "term": "mellomkrigstiden",
        "weight": 4
      },
      {
        "term": "fascisme",
        "weight": 4
      },
      {
        "term": "massearbeidsledighet",
        "weight": 4
      }
    ]
  },
  "global_kolonial_transnasjonal": {
    "required_anchor_terms": [
      "kolonialisme",
      "imperium",
      "transnasjonal",
      "diaspora",
      "dekolonisering",
      "slavehandel"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "kolonialisme",
        "weight": 4
      },
      {
        "term": "imperium",
        "weight": 4
      },
      {
        "term": "dekolonisering",
        "weight": 4
      },
      {
        "term": "transnasjonale nettverk",
        "weight": 4
      },
      {
        "term": "slavehandel",
        "weight": 4
      }
    ]
  },
  "historisk_tid_periodisering": {
    "required_anchor_terms": [
      "periodisering",
      "kronologi",
      "kontinuitet",
      "historisk brudd",
      "anakronisme",
      "samtidighet"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "periodisering",
        "weight": 4
      },
      {
        "term": "kronologi",
        "weight": 4
      },
      {
        "term": "kontinuitet og brudd",
        "weight": 4
      },
      {
        "term": "anakronisme",
        "weight": 4
      },
      {
        "term": "samtidighet",
        "weight": 4
      }
    ]
  },
  "industri_arbeid_sosialhistorie": {
    "required_anchor_terms": [
      "industrialisering",
      "industrialiseringen",
      "arbeiderbevegelse",
      "arbeiderbevegelsen",
      "fabrikk",
      "fabrikkarbeid",
      "arbeidsdeling",
      "klasse",
      "klasseforhold",
      "fagforening",
      "fagforeninger"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "industrialisering",
        "weight": 4
      },
      {
        "term": "fabrikkarbeid",
        "weight": 4
      },
      {
        "term": "arbeiderbevegelse",
        "weight": 4
      },
      {
        "term": "fagforening",
        "weight": 4
      },
      {
        "term": "klasseforhold",
        "weight": 4
      }
    ]
  },
  "kald_krig_etterkrig": {
    "required_anchor_terms": [
      "kald krig",
      "etterkrigstiden",
      "blokkdeling",
      "jernteppet",
      "atomavskrekking",
      "nato",
      "warszawapakten"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "kald krig",
        "weight": 4
      },
      {
        "term": "jernteppet",
        "weight": 4
      },
      {
        "term": "atomavskrekking",
        "weight": 4
      },
      {
        "term": "blokkdeling",
        "weight": 4
      },
      {
        "term": "nato",
        "weight": 4
      }
    ]
  },
  "katastrofer_brudd_ulykker": {
    "required_anchor_terms": [
      "katastrofe",
      "brann",
      "ulykke",
      "beredskap",
      "sårbarhet",
      "gjenoppbygging"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "katastrofe",
        "weight": 4
      },
      {
        "term": "sårbarhet",
        "weight": 4
      },
      {
        "term": "beredskap",
        "weight": 4
      },
      {
        "term": "gjenoppbygging",
        "weight": 4
      },
      {
        "term": "hendelsesforløp",
        "weight": 4
      }
    ]
  },
  "kilder_arkiv_spor": {
    "required_anchor_terms": [
      "kildekritikk",
      "proveniens",
      "arkivtaushet",
      "førstehåndskilde",
      "kontekstualisering",
      "kildespor"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "kildekritikk",
        "weight": 4
      },
      {
        "term": "proveniens",
        "weight": 4
      },
      {
        "term": "arkivtaushet",
        "weight": 4
      },
      {
        "term": "førstehåndskilde",
        "weight": 4
      },
      {
        "term": "kontekstualisering",
        "weight": 4
      }
    ]
  },
  "kjonn_familie_livslop": {
    "required_anchor_terms": [
      "kjønnshistorie",
      "familiehistorie",
      "seksualitet",
      "livsløp",
      "hushold",
      "reproduksjon"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "kjønnshistorie",
        "weight": 4
      },
      {
        "term": "livsløp",
        "weight": 4
      },
      {
        "term": "hushold",
        "weight": 4
      },
      {
        "term": "seksualitet",
        "weight": 4
      },
      {
        "term": "reproduksjon",
        "weight": 4
      }
    ]
  },
  "krig_okkupasjon_motstand": {
    "required_anchor_terms": [
      "okkupasjon",
      "motstandsbevegelse",
      "kollaborasjon",
      "krigsforbrytelse",
      "frigjøring",
      "illegal presse"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "okkupasjon",
        "weight": 4
      },
      {
        "term": "motstandsbevegelse",
        "weight": 4
      },
      {
        "term": "kollaborasjon",
        "weight": 4
      },
      {
        "term": "illegal presse",
        "weight": 4
      },
      {
        "term": "frigjøring",
        "weight": 4
      }
    ]
  },
  "makt_stat_institusjoner": {
    "required_anchor_terms": [
      "institusjonsbygging",
      "statlig kapasitet",
      "mandat",
      "kompetanse",
      "legitimitet",
      "embetsverk"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "institusjonsbygging",
        "weight": 4
      },
      {
        "term": "statlig kapasitet",
        "weight": 4
      },
      {
        "term": "mandat",
        "weight": 4
      },
      {
        "term": "kompetanse",
        "weight": 4
      },
      {
        "term": "legitimitet",
        "weight": 4
      }
    ]
  },
  "middelalder_kirke_kongemakt": {
    "required_anchor_terms": [
      "middelalder",
      "kongemakt",
      "kirkeorganisasjon",
      "ting",
      "svartedauden",
      "len"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "middelalder",
        "weight": 4
      },
      {
        "term": "kongemakt",
        "weight": 4
      },
      {
        "term": "kirkeorganisasjon",
        "weight": 4
      },
      {
        "term": "tingordning",
        "weight": 4
      },
      {
        "term": "svartedauden",
        "weight": 4
      }
    ]
  },
  "migrasjon_minoritet_tilhorighet": {
    "required_anchor_terms": [
      "migrasjonshistorie",
      "minoritet",
      "diaspora",
      "tilhørighet",
      "utvandring",
      "innvandring"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "migrasjonshistorie",
        "weight": 4
      },
      {
        "term": "utvandring",
        "weight": 4
      },
      {
        "term": "innvandring",
        "weight": 4
      },
      {
        "term": "diaspora",
        "weight": 4
      },
      {
        "term": "tilhørighet",
        "weight": 4
      }
    ]
  },
  "miljo_klima_landskap": {
    "required_anchor_terms": [
      "miljøhistorie",
      "klimahistorie",
      "landskapshistorie",
      "ressursbruk",
      "naturinngrep",
      "arealendring"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "miljøhistorie",
        "weight": 4
      },
      {
        "term": "klimahistorie",
        "weight": 4
      },
      {
        "term": "landskapshistorie",
        "weight": 4
      },
      {
        "term": "ressursbruk",
        "weight": 4
      },
      {
        "term": "naturinngrep",
        "weight": 4
      }
    ]
  },
  "minne_kulturarv_historiebruk": {
    "required_anchor_terms": [
      "kollektivt minne",
      "kulturarv",
      "historiebruk",
      "minnested",
      "monument",
      "minnepolitikk"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "kollektivt minne",
        "weight": 4
      },
      {
        "term": "kulturarv",
        "weight": 4
      },
      {
        "term": "historiebruk",
        "weight": 4
      },
      {
        "term": "minnested",
        "weight": 4
      },
      {
        "term": "minnepolitikk",
        "weight": 4
      }
    ]
  },
  "offentlighet_mobilisering_bevegelser": {
    "required_anchor_terms": [
      "offentlighet",
      "mobilisering",
      "sosial bevegelse",
      "arbeiderbevegelse",
      "presseoffentlighet",
      "demonstrasjon"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "presseoffentlighet",
        "weight": 4
      },
      {
        "term": "idédebatt",
        "weight": 4
      },
      {
        "term": "redaksjonell profil",
        "weight": 4
      },
      {
        "term": "redaksjonelle profil",
        "weight": 4
      },
      {
        "term": "medieinstitusjoner",
        "weight": 4
      },
      {
        "term": "dannelsesoffentlighet",
        "weight": 4
      },
      {
        "term": "medielandskapet",
        "weight": 4
      },
      {
        "term": "sosial bevegelse",
        "weight": 4
      },
      {
        "term": "mobilisering",
        "weight": 4
      }
    ]
  },
  "okonomi_handel_materielle_systemer": {
    "required_anchor_terms": [
      "kreditt",
      "markedsintegrasjon",
      "sjøfart",
      "handelsnettverk",
      "kapitalakkumulasjon",
      "varekjede"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "kreditt",
        "weight": 4
      },
      {
        "term": "markedsintegrasjon",
        "weight": 4
      },
      {
        "term": "sjøfart",
        "weight": 4
      },
      {
        "term": "kommersielle nettverk",
        "weight": 4
      },
      {
        "term": "kapitalakkumulasjon",
        "weight": 4
      }
    ]
  },
  "religion_reformasjon_livssyn": {
    "required_anchor_terms": [
      "reformasjon",
      "konfesjonalisering",
      "statskirke",
      "sekularisering",
      "trosfrihet",
      "kristning"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "reformasjon",
        "weight": 4
      },
      {
        "term": "konfesjonalisering",
        "weight": 4
      },
      {
        "term": "statskirke",
        "weight": 4
      },
      {
        "term": "sekularisering",
        "weight": 4
      },
      {
        "term": "trosfrihet",
        "weight": 4
      }
    ]
  },
  "samisk_urfolkshistorie": {
    "required_anchor_terms": [
      "fornorsking",
      "sannhets- og forsoningskommisjonen",
      "siida",
      "urfolk",
      "samisk historie",
      "revitalisering"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "fornorsking",
        "weight": 4
      },
      {
        "term": "siida",
        "weight": 4
      },
      {
        "term": "urfolkshistorie",
        "weight": 4
      },
      {
        "term": "revitalisering",
        "weight": 4
      },
      {
        "term": "samisk rettighetskamp",
        "weight": 4
      }
    ]
  },
  "velferd_rett_hverdagsliv": {
    "required_anchor_terms": [
      "fattiglov",
      "sosialforsikring",
      "trygd",
      "velferdsstat",
      "hospital",
      "offentlig helse"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "fattiglov",
        "weight": 4
      },
      {
        "term": "sosialforsikring",
        "weight": 4
      },
      {
        "term": "trygd",
        "weight": 4
      },
      {
        "term": "velferdsstat",
        "weight": 4
      },
      {
        "term": "hospital",
        "weight": 4
      }
    ]
  },
  "vitenskap_teknologi_kunnskap": {
    "required_anchor_terms": [
      "kunnskapsinstitusjoner",
      "standardisering",
      "måling",
      "statistikk",
      "datamakt",
      "profesjonalisering"
    ],
    "supplemental_evidence_terms": [
      {
        "term": "kunnskapsinstitusjoner",
        "weight": 4
      },
      {
        "term": "standardisering",
        "weight": 4
      },
      {
        "term": "måling",
        "weight": 4
      },
      {
        "term": "statistikk",
        "weight": 4
      },
      {
        "term": "datamakt",
        "weight": 4
      }
    ]
  }
});
const TEMPORAL_GATE = Object.freeze({
  required: true,
  year_pattern: "\\b(?:1[0-9]{3}|20[0-9]{2})\\b",
  terms: ["historie", "historisk", "historiske", "historien", "over tid", "i perioder", "periode", "perioder", "tidligere", "senere", "utvikling", "utviklet", "endring", "endret", "ombygging", "etterkrigstiden", "mellomkrigstiden", "dekolonisering", "over generasjoner", "over flere generasjoner", "gjennom livsløpet", "middelalder", "forhistorie", "forhistorien", "fortiden", "kronologi", "århundre", "århundrer", "1814", "1905", "1914", "1918", "1939", "1940", "1945", "1991"]
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

function eligibleUniqueTerm(term) {
  const value = normalize(term);
  if (!value || value.length > 80 || value.split(" ").length > 6) return false;
  if (/^(?:begrep-|em_|met_|con_his_)/.test(value)) return false;
  if (/[.!?]$/.test(value)) return false;
  return true;
}

function allCollisions(audit) {
  if (Array.isArray(audit.term_collisions)) return audit.term_collisions;
  return [
    ...(audit.high_risk_terms || []),
    ...(audit.medium_risk_terms || []),
    ...(audit.low_risk_terms || [])
  ];
}

function classifyCollision(collision) {
  const term = normalize(collision.term);
  if (REVIEWED_COLLISION_OVERRIDES.has(term)) return REVIEWED_COLLISION_OVERRIDES.get(term);
  if (GENERIC_LANGUAGE_TERMS.has(term)) return { category: "generic_language", action: "non_scoring", multiplier: 0 };
  if (collision.risk === "high") return { category: "subject_wide_or_multi_chapter", action: "non_scoring", multiplier: 0 };
  if (collision.risk === "medium") return { category: "cross_chapter", action: "down_weight", multiplier: 0.3 };
  return { category: "shared_phrase", action: "context_only", multiplier: 0 };
}

function validateInputs(corpus, audit) {
  if (corpus.source_ref !== audit.source_ref) throw new Error("Corpus and audit source_ref differ.");
  if (corpus.subject_filter !== "historie") throw new Error(`Unexpected subject_filter: ${corpus.subject_filter}`);
  if (JSON.stringify(audit.subject_filter) !== JSON.stringify(["historie"])) throw new Error("Audit is not History-scoped.");
  if (!Array.isArray(corpus.entries) || corpus.entries.length !== 23) throw new Error("History corpus must contain exactly 23 chapters.");
  if (corpus.entries.some((entry) => entry.subject_id !== "historie")) throw new Error("Non-History entry leaked into corpus.");
  if (audit.gate?.passed !== true || (audit.gate?.errors || []).length) throw new Error("History corpus audit gate has not passed.");
  if (audit.coverage?.materialized !== 23 || audit.coverage?.registered !== 23) throw new Error("History registry coverage is not 23/23.");
  if (corpus.entries.reduce((sum, entry) => sum + (entry.module_source_paths || []).length, 0) !== 69) {
    throw new Error("History corpus must contain 69 registered module files.");
  }
  const summary = audit.term_collision_summary || {};
  if (summary.total !== 292 || summary.high_risk !== 96 || summary.medium_risk !== 108 || summary.low_risk !== 88) {
    throw new Error("History collision audit summary differs from the reviewed 292-term baseline.");
  }
}

function buildPolicy(corpus, audit) {
  validateInputs(corpus, audit);
  const collisions = allCollisions(audit);
  const byTerm = new Map();
  for (const collision of collisions) byTerm.set(normalize(collision.term), collision);
  if (byTerm.size !== 292) throw new Error(`Expected 292 unique collision terms, got ${byTerm.size}.`);

  const collisionSet = new Set(byTerm.keys());
  const globalNonScoring = new Set(GENERIC_LANGUAGE_TERMS);
  const terms = [...byTerm.values()].map((collision) => ({
    term: normalize(collision.term),
    risk: collision.risk,
    chapter_count: collision.chapter_count,
    chapters: collision.chapters,
    ...classifyCollision(collision)
  })).sort((a, b) => a.term.localeCompare(b.term, "nb"));

  const chapterEntries = corpus.entries.map((entry) => {
    const candidates = [...entry.title_terms, ...entry.concept_terms, ...entry.support_terms]
      .map(normalize)
      .filter((term) => !collisionSet.has(term) && !globalNonScoring.has(term))
      .filter(eligibleUniqueTerm);
    return {
      chapter_id: entry.chapter_id,
      title: entry.title,
      unique_evidence_terms: [...new Set(candidates)].slice(0, 50),
      chapter_rule: CHAPTER_RULES[entry.chapter_id]
    };
  });

  const missingRules = chapterEntries.filter((entry) => !entry.chapter_rule).map((entry) => entry.chapter_id);
  if (missingRules.length) throw new Error(`Missing History chapter rules: ${missingRules.join(", ")}`);

  const summary = terms.reduce((result, item) => {
    result.total += 1;
    result[item.action] = (result[item.action] || 0) + 1;
    result.categories[item.category] = (result.categories[item.category] || 0) + 1;
    result.risks[item.risk] = (result.risks[item.risk] || 0) + 1;
    return result;
  }, { total: 0, non_scoring: 0, down_weight: 0, context_only: 0, categories: {}, risks: {} });

  return {
    schema: "aha_history_fagverk_term_policy_v1",
    version: "1.0.0",
    status: "review_policy_full_fixture_candidate_not_runtime_active",
    source_repo: corpus.source_repo,
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    subject_id: "historie",
    lifecycle_stage: "subject_release_review",
    approval_required: true,
    activation_allowed: false,
    runtime_activation_allowed: false,
    thresholds: { minimum_score: 7, minimum_terms: 2, ambiguity_margin: 3 },
    default_weights: { title_term: 5, concept_term: 3, support_term: 1.5, supplemental_evidence_term: 4, down_weight_multiplier: 0.3 },
    temporal_gate: TEMPORAL_GATE,
    policy_rules: {
      high_risk: "non_scoring",
      medium_risk: "down_weight_unless_generic_language",
      low_risk_shared_phrase: "context_only",
      generic_language: "non_scoring",
      temporal_anchor: "required_for_every_history_selection",
      chapter_anchor: "required_for_every_chapter",
      supplemental_evidence: "chapter_scoped_only"
    },
    generic_language_terms: [...GENERIC_LANGUAGE_TERMS].sort((a, b) => a.localeCompare(b, "nb")),
    global_non_scoring_terms: [...globalNonScoring].sort((a, b) => a.localeCompare(b, "nb")),
    chapter_rules: CHAPTER_RULES,
    summary,
    terms,
    chapters: chapterEntries
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-history-fagverk-term-policy.mjs [--corpus path] [--audit path] [--output path]");
    return;
  }
  const policy = buildPolicy(readJson(args.corpus), readJson(args.audit));
  writeJson(args.output, policy);
  console.log(`Wrote History term policy: ${policy.summary.total} collisions; ${policy.chapters.length} chapter rules.`);
}

main();
