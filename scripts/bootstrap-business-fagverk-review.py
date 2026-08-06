from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_REF = "c16a187453d16a40f9cab4ca694c32e96014f31b"
CORPUS_SHA = "a1c399977c2656d567ee461228b8e7d21f457da8e0863bf53a7888a8ac5fbfea"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def write_json(path: str, value: object) -> None:
    write(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def replace_once(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"Expected exactly one occurrence: {old!r}; got {text.count(old)}")
    return text.replace(old, new)


# Derive the evaluator from the already reviewed Nature implementation.
evaluator = read("scripts/evaluate-nature-fagverk-policy.mjs")
for old, new in [
    ('import { normalize, scoreNature } from "./lib/nature-fagverk-scoring.mjs";', 'import { normalize, scoreBusiness } from "./lib/business-fagverk-scoring.mjs";'),
    ('"data/integrations/candidates/history-go-fagverk-natur.candidate.v1.json"', '"data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json"'),
    ('"data/integrations/review/history-go-fagverk-natur.term-policy.v1.json"', '"data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json"'),
    ('"data/evaluation/aha-nature-fagverk-evaluation-matrix.v1.json"', '"data/evaluation/aha-business-fagverk-evaluation-matrix.v1.json"'),
    ('"data/evaluation/aha-nature-fagverk-evaluation-report.v1.json"', '"data/evaluation/aha-business-fagverk-evaluation-report.v1.json"'),
    ('scoreNature(testCase.text, corpus, policy)', 'scoreBusiness(testCase.text, corpus, policy)'),
    ('corpus.subject_filter !== "natur"', 'corpus.subject_filter !== "naeringsliv"'),
    ('policy.subject_id !== "natur"', 'policy.subject_id !== "naeringsliv"'),
    ('matrix.subject_id !== "natur"', 'matrix.subject_id !== "naeringsliv"'),
    ('"Corpus is not Nature-scoped."', '"Corpus is not Business-scoped."'),
    ('"Policy is not Nature-scoped."', '"Policy is not Business-scoped."'),
    ('"Matrix is not Nature-scoped."', '"Matrix is not Business-scoped."'),
    ('corpus.entries.length !== 11', 'corpus.entries.length !== 12'),
    ('"Nature corpus does not contain 11 chapters."', '"Business corpus does not contain 12 chapters."'),
    ('matrix.positive_cases.length !== 11', 'matrix.positive_cases.length !== 12'),
    ('matrix.confusion_cases.length !== 11', 'matrix.confusion_cases.length !== 12'),
    ('schema: "aha_nature_fagverk_evaluation_report_v1"', 'schema: "aha_business_fagverk_evaluation_report_v1"'),
    ('evaluate-nature-fagverk-policy.mjs', 'evaluate-business-fagverk-policy.mjs'),
    ('Nature evaluation:', 'Business evaluation:'),
]:
    evaluator = replace_once(evaluator, old, new)
write("scripts/evaluate-business-fagverk-policy.mjs", evaluator)

# Derive the canonical fixture comparator from the same reviewed implementation.
comparator = read("scripts/compare-nature-fixture-corrections.mjs")
for old, new in [
    ('import { scoreNature } from "./lib/nature-fagverk-scoring.mjs";', 'import { scoreBusiness } from "./lib/business-fagverk-scoring.mjs";'),
    ('"data/integrations/candidates/history-go-fagverk-natur.candidate.v1.json"', '"data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json"'),
    ('"data/integrations/review/history-go-fagverk-natur.term-policy.v1.json"', '"data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json"'),
    ('"data/evaluation/aha-nature-fixture-corrections.v1.json"', '"data/evaluation/aha-business-fixture-corrections.v1.json"'),
    ('"data/evaluation/aha-nature-fixture-correction-report.v1.json"', '"data/evaluation/aha-business-fixture-correction-report.v1.json"'),
    ('corpus.subject_filter !== "natur" || policy.subject_id !== "natur" || corrections.subject_id !== "natur"', 'corpus.subject_filter !== "naeringsliv" || policy.subject_id !== "naeringsliv" || corrections.subject_id !== "naeringsliv"'),
    ('"Fixture correction inputs are not consistently Nature-scoped."', '"Fixture correction inputs are not consistently Business-scoped."'),
    ('"Nature fixture correction matrix must contain all 16 canonical fixtures."', '"Business fixture correction matrix must contain all 16 canonical fixtures."'),
    ('scoreNature(fixture.inputText, corpus, policy)', 'scoreBusiness(fixture.inputText, corpus, policy)'),
    ('correction.expected_nature_status', 'correction.expected_business_status'),
    ('expected_nature_status: correction.expected_nature_status', 'expected_business_status: correction.expected_business_status'),
    ('schema: "aha_nature_fixture_correction_report_v1"', 'schema: "aha_business_fixture_correction_report_v1"'),
    ('compare-nature-fixture-corrections.mjs', 'compare-business-fixture-corrections.mjs'),
    ('Nature fixture corrections:', 'Business fixture corrections:'),
]:
    comparator = replace_once(comparator, old, new)
write("scripts/compare-business-fixture-corrections.mjs", comparator)

rules = {
    "arbeid-produksjon-verdiskaping": {
        "anchor": "bruttoprodukt",
        "evidence": ["produksjonsverdi fratrukket produktinnsats", "verdiskaping per arbeidstime"],
        "forbidden": "regnskap-revisjon-okonomistyring",
        "generic": "organisasjon og teknologi",
    },
    "forretningsjus-skatt-compliance": {
        "anchor": "compliance",
        "evidence": ["juridisk faktummatrise", "dokumentert skattegrunnlag"],
        "forbidden": "makt-regulering-baerekraft",
        "generic": "regulering og ansvar",
    },
    "handel-forbruk-marked": {
        "anchor": "markedsavgrensning",
        "evidence": ["produktmarked og geografisk marked", "dokumentert sammenligningspris"],
        "forbidden": "markedsforing-strategi-kunder",
        "generic": "kunde og strategi",
    },
    "internasjonal-okonomi-operations-prosjekt": {
        "anchor": "valutakurs",
        "evidence": ["valutaeksponering i verdikjeden", "total cost of ownership"],
        "forbidden": "logistikk-infrastruktur-okonomisk-rom",
        "generic": "prosjekt og risiko",
    },
    "kapital-eierskap-finans": {
        "anchor": "nåverdi",
        "evidence": ["diskontert fri kontantstrøm", "vektet kapitalkostnad"],
        "forbidden": "regnskap-revisjon-okonomistyring",
        "generic": "kapital og verdi",
    },
    "kvantitative-metoder-business-analytics": {
        "anchor": "regresjonsanalyse",
        "evidence": ["estimat med usikkerhetsintervall", "korrelasjon er ikke kausal effekt"],
        "forbidden": "markedsforing-strategi-kunder",
        "generic": "data og analyse",
    },
    "logistikk-infrastruktur-okonomisk-rom": {
        "anchor": "transportkostnad",
        "evidence": ["dør til dør-ledetid", "lagerets kapitalbinding"],
        "forbidden": "internasjonal-okonomi-operations-prosjekt",
        "generic": "handel og ressurser",
    },
    "makrookonomi-konjunkturer-okonomisk-politikk": {
        "anchor": "bruttonasjonalprodukt",
        "evidence": ["realvekst i bruttonasjonalprodukt", "inflasjon målt med konsumprisindeks"],
        "forbidden": "kapital-eierskap-finans",
        "generic": "økonomi og pris",
    },
    "makt-regulering-baerekraft": {
        "anchor": "eksternalitet",
        "evidence": ["negativ eksternalitet utenfor prisen", "dobbel vesentlighetsanalyse"],
        "forbidden": "forretningsjus-skatt-compliance",
        "generic": "regulering og risiko",
    },
    "markedsforing-strategi-kunder": {
        "anchor": "kundelivstidsverdi",
        "evidence": ["kundelivstidsverdi og anskaffelseskostnad", "eksperimentell måling av konvertering"],
        "forbidden": "handel-forbruk-marked",
        "generic": "marked og kunder",
    },
    "regnskap-revisjon-okonomistyring": {
        "anchor": "periodisering",
        "evidence": ["periodisert inntekt og kostnad", "avstemming mellom resultat og kontantstrøm"],
        "forbidden": "kapital-eierskap-finans",
        "generic": "økonomi og måling",
    },
    "teknologi-innovasjon-plattformer": {
        "anchor": "nettverkseffekt",
        "evidence": ["tosidig marked med nettverkseffekt", "plattformens styringsregler"],
        "forbidden": "markedsforing-strategi-kunder",
        "generic": "teknologi og strategi",
    },
}

positive_cases = []
confusion_cases = []
for chapter_id, spec in rules.items():
    e1, e2 = spec["evidence"]
    positive_cases.append({
        "id": f"business-positive-{chapter_id}",
        "text": f"Analysen bruker {spec['anchor']} og dokumenterer {e1} sammen med {e2} før konklusjonen trekkes.",
        "expected_status": "grounded",
        "expected_chapter_id": chapter_id,
        "required_evidence": [e1, e2],
    })
    confusion_cases.append({
        "id": f"business-confusion-{chapter_id}",
        "text": f"Teksten nevner {spec['generic']}, men avgrenses faglig med {spec['anchor']}, {e1} og {e2}.",
        "expected_status": "grounded",
        "expected_chapter_id": chapter_id,
        "required_evidence": [e1, e2],
        "forbidden_chapter_ids": [spec["forbidden"]],
    })

ambiguity_specs = [
    ("generic-market", "Bedriften diskuterer marked, pris og kunder uten målegrunnlag.", ["bedrift", "marked", "pris", "kunder"]),
    ("generic-work", "Arbeid, organisasjon og teknologi omtales overordnet.", ["arbeid", "organisasjon", "teknologi"]),
    ("generic-project", "Prosjekt, risiko og strategi nevnes uten metode.", ["prosjekt", "risiko", "strategi"]),
    ("generic-economy", "Økonomi og verdi diskuteres generelt uten beregning.", ["økonomi", "verdi"]),
    ("generic-capital", "Kapital og virksomhet omtales uten kontantstrøm eller beregning.", ["kapital", "virksomhet"]),
    ("generic-data", "Data og analyse nevnes uten modell eller usikkerhet.", ["data", "analyse"]),
    ("generic-trade", "Handel og ressurser omtales uten ledetid eller kostnad.", ["handel", "ressurser"]),
    ("generic-policy", "Politikk og økonomisk utvikling beskrives uten indikatorer.", ["økonomisk", "utvikling"]),
    ("generic-regulation", "Regulering og risiko nevnes uten eksternalitet eller vesentlighet.", ["risiko"]),
    ("generic-marketing", "Marked og kunder omtales uten segment eller konvertering.", ["marked", "kunder"]),
    ("generic-accounting", "Økonomi og måling nevnes uten periodisering eller avstemming.", ["økonomi", "måling"]),
    ("generic-platform", "Teknologi og strategi omtales uten nettverkseffekt eller styringsregel.", ["teknologi", "strategi"]),
]
ambiguity_cases = [
    {
        "id": f"business-abstain-{case_id}",
        "text": text,
        "allowed_statuses": ["unsupported", "ambiguous"],
        "non_scoring_evidence": evidence,
    }
    for case_id, text, evidence in ambiguity_specs
]

matrix = {
    "schema": "aha_business_fagverk_evaluation_matrix_v1",
    "version": "1.0.0",
    "status": "review_matrix_not_runtime_active",
    "subject_id": "naeringsliv",
    "source_ref": SOURCE_REF,
    "corpus_sha256": CORPUS_SHA,
    "runtime_activation_allowed": False,
    "positive_cases": positive_cases,
    "confusion_cases": confusion_cases,
    "ambiguity_cases": ambiguity_cases,
}
write_json("data/evaluation/aha-business-fagverk-evaluation-matrix.v1.json", matrix)

fixture_paths = [
    "01-pinse-religion.json", "02-morgenbladet-mediehistorie.json", "03-nav-reformen-forvaltning.json",
    "04-litteraer-tilknytningsteori.json", "05-dagbok-refleksjon.json", "06-prosjektplan-teknisk-notat.json",
    "07-juridisk-tekst.json", "08-uklar-lav-confidence.json", "09-morgenbladet-offentlighet-kulturkritikk.json",
    "10-nav-reformen-brukermoete.json", "11-refleksjon-laering-feil-vaner.json",
    "12-refleksjon-byrom-uro-konsentrasjon.json", "13-historygo-eidsvoll-grunnloven.json",
    "14-historygo-bislett-byrom-stadion.json", "15-uklar-fragmentert-lav-kvalitet.json",
    "16-tverrfaglig-ai-laering-kunnskap.json",
]
corrections = {
    "schema": "aha_business_fixture_corrections_v1",
    "version": "1.0.0",
    "status": "review_fixture_expectations_not_runtime_active",
    "subject_id": "naeringsliv",
    "source_ref": SOURCE_REF,
    "corpus_sha256": CORPUS_SHA,
    "runtime_activation_allowed": False,
    "cases": [
        {
            "id": f"business-fixture-{index:02d}",
            "fixture_path": f"docs/fixtures/aha-analysis/{name}",
            "expected_business_status": "unsupported",
            "expected_chapter_id": None,
        }
        for index, name in enumerate(fixture_paths, 1)
    ],
}
write_json("data/evaluation/aha-business-fixture-corrections.v1.json", corrections)

registry_path = ROOT / "data/integrations/review/history-go-fagverk-subject-approval-registry.v1.json"
registry = json.loads(registry_path.read_text(encoding="utf-8"))
registry["version"] = "1.3.0"
registry["subjects"]["naeringsliv"] = {
    "subject_id": "naeringsliv",
    "approval_path": "data/integrations/approvals/history-go-fagverk-naeringsliv.approved.v1.json",
    "candidate": {
        "path": "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json",
        "source_ref_field": "source_ref",
        "digest_field": "content_sha256",
    },
    "review_corpus": {
        "path": "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json",
        "source_ref_field": "source_ref",
        "digest_field": "content_sha256",
    },
    "gates": [
        {
            "id": "corpus_audit",
            "path": "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate-audit.v1.json",
            "status_field": "gate.passed",
            "expected_status": True,
            "source_ref_field": "source_ref",
        },
        {
            "id": "subject_expansion",
            "path": "data/integrations/review/history-go-fagverk-naeringsliv.expansion-review.v1.json",
            "status_field": "status",
            "expected_status": "reviewed_subject_expansion_not_runtime_active",
            "source_ref_field": "candidate.source_ref",
            "digest_field": "candidate.corpus_sha256",
            "approval_field": "approval_required",
            "expected_approval": True,
            "runtime_field": "runtime_activation_allowed",
            "expected_runtime": False,
            "summary_expectations": {
                "baseline.chapter_count": 0,
                "candidate.chapter_count": 12,
                "candidate.module_file_count": 36,
                "delta.retained_chapter_count": 0,
                "delta.added_chapter_count": 12,
                "delta.removed_chapter_count": 0,
                "materialization_assessment.chapter_contract_sufficient_for_subject_review": True,
                "materialization_assessment.complete_three_module_structure_per_chapter": True,
            },
        },
        {
            "id": "term_policy",
            "path": "data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json",
            "status_field": "status",
            "expected_status": "review_policy_full_fixture_candidate_not_runtime_active",
            "source_ref_field": "source_ref",
            "digest_field": "corpus_sha256",
            "approval_field": "approval_required",
            "expected_approval": True,
            "runtime_field": "runtime_activation_allowed",
            "expected_runtime": False,
            "summary_expectations": {
                "summary.total": 140,
                "summary.risks.high": 65,
                "summary.risks.medium": 51,
                "summary.risks.low": 24,
                "summary.chapter_count": 12,
                "summary.module_file_count": 36,
            },
        },
        {
            "id": "evaluation",
            "path": "data/evaluation/aha-business-fagverk-evaluation-report.v1.json",
            "status_field": "status",
            "expected_status": "passed_review_gate",
            "source_ref_field": "source_ref",
            "digest_field": "corpus_sha256",
            "runtime_field": "runtime_activation_allowed",
            "expected_runtime": False,
            "summary_expectations": {
                "summary.total": 36,
                "summary.passed": 36,
                "summary.failed": 0,
                "summary.chapters_covered": 12,
                "summary.evidence_errors": 0,
            },
        },
        {
            "id": "fixture_corrections",
            "path": "data/evaluation/aha-business-fixture-correction-report.v1.json",
            "status_field": "status",
            "expected_status": "passed_correction_gate",
            "source_ref_field": "source_ref",
            "digest_field": "corpus_sha256",
            "runtime_field": "runtime_activation_allowed",
            "expected_runtime": False,
            "summary_expectations": {
                "summary.total": 16,
                "summary.passed": 16,
                "summary.failed": 0,
                "summary.validation_errors": 0,
                "summary.grounded": 0,
                "summary.unsupported": 16,
                "summary.ambiguous": 0,
            },
        },
    ],
}
registry["subjects"] = dict(sorted(registry["subjects"].items()))
write_json("data/integrations/review/history-go-fagverk-subject-approval-registry.v1.json", registry)

subject_test_path = "tests/aha-fagverk-subject-approvals.test.cjs"
subject_test = read(subject_test_path)
subject_test = replace_once(
    subject_test,
    "assert.deepEqual(Object.keys(registry.subjects), ['historie', 'natur', 'politikk']);",
    "assert.deepEqual(Object.keys(registry.subjects), ['historie', 'naeringsliv', 'natur', 'politikk']);",
)
write(subject_test_path, subject_test)

review_test = r'''const assert = require("assert");
const fs = require("fs");
const crypto = require("crypto");

function read(path) {
  assert.equal(fs.existsSync(path), true, path);
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

const paths = {
  candidate: "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json",
  audit: "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate-audit.v1.json",
  policy: "data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json",
  expansion: "data/integrations/review/history-go-fagverk-naeringsliv.expansion-review.v1.json",
  matrix: "data/evaluation/aha-business-fagverk-evaluation-matrix.v1.json",
  evaluation: "data/evaluation/aha-business-fagverk-evaluation-report.v1.json",
  corrections: "data/evaluation/aha-business-fixture-corrections.v1.json",
  correctionReport: "data/evaluation/aha-business-fixture-correction-report.v1.json",
  approval: "data/integrations/approvals/history-go-fagverk-naeringsliv.approved.v1.json",
  registry: "data/integrations/review/history-go-fagverk-subject-approval-registry.v1.json",
  runtime: "data/integrations/history-go-fagverk-release.runtime-active.json"
};

const candidate = read(paths.candidate);
const audit = read(paths.audit);
const policy = read(paths.policy);
const expansion = read(paths.expansion);
const matrix = read(paths.matrix);
const evaluation = read(paths.evaluation);
const corrections = read(paths.corrections);
const correctionReport = read(paths.correctionReport);
const approval = read(paths.approval);
const registry = read(paths.registry);
const runtime = read(paths.runtime);

assert.equal(candidate.subject_filter, "naeringsliv");
assert.equal(candidate.entries.length, 12);
assert.equal(candidate.entries.reduce((sum, entry) => sum + entry.module_source_paths.length, 0), 36);
assert.equal(candidate.approval_required, true);
assert.equal(candidate.runtime_activation_allowed, false);
assert.equal(audit.gate.passed, true);
assert.deepEqual(audit.coverage, { expected: 12, registered: 12, materialized: 12, missing: [], unexpected: [], duplicate_chapter_ids: [] });
assert.deepEqual(audit.term_collision_summary, { total: 140, high_risk: 65, medium_risk: 51, low_risk: 24 });

assert.equal(policy.schema, "aha_business_fagverk_term_policy_v1");
assert.equal(policy.source_ref, candidate.source_ref);
assert.equal(policy.corpus_sha256, candidate.content_sha256);
assert.deepEqual(policy.summary, { total: 140, risks: { high: 65, medium: 51, low: 24 }, chapter_count: 12, module_file_count: 36 });
assert.equal(Object.keys(policy.chapter_rules).length, 12);
assert.equal(policy.chapters.length, 12);
assert.equal(policy.domain_gate.required, true);
assert.equal(policy.runtime_activation_allowed, false);
for (const entry of candidate.entries) {
  const rule = policy.chapter_rules[entry.chapter_id];
  assert.ok(rule, entry.chapter_id);
  assert.ok(rule.required_anchor_terms.length >= 5, entry.chapter_id);
  assert.ok(rule.supplemental_evidence_terms.length >= 5, entry.chapter_id);
}

assert.equal(expansion.status, "reviewed_subject_expansion_not_runtime_active");
assert.equal(expansion.baseline.chapter_count, 0);
assert.equal(expansion.candidate.chapter_count, 12);
assert.equal(expansion.candidate.module_file_count, 36);
assert.equal(expansion.delta.retained_chapter_count, 0);
assert.equal(expansion.delta.added_chapter_count, 12);
assert.equal(expansion.delta.removed_chapter_count, 0);
assert.equal(expansion.materialization_assessment.complete_three_module_structure_per_chapter, true);
assert.equal(expansion.runtime_activation_allowed, false);

assert.equal(matrix.positive_cases.length, 12);
assert.equal(matrix.confusion_cases.length, 12);
assert.equal(matrix.ambiguity_cases.length, 12);
assert.equal(new Set(matrix.positive_cases.map((item) => item.expected_chapter_id)).size, 12);
assert.equal(evaluation.status, "passed_review_gate");
assert.deepEqual(evaluation.summary, { total: 36, passed: 36, failed: 0, positive: 12, confusion: 12, ambiguity: 12, chapters_covered: 12, evidence_errors: 0 });

assert.equal(corrections.cases.length, 16);
assert.equal(correctionReport.status, "passed_correction_gate");
assert.deepEqual(correctionReport.summary, { total: 16, passed: 16, failed: 0, validation_errors: 0, grounded: 0, unsupported: 16, ambiguous: 0 });

assert.equal(registry.subjects.naeringsliv.subject_id, "naeringsliv");
assert.equal(registry.runtime_activation_allowed, false);
assert.equal(approval.status, "subject_review_approved_not_runtime_active");
assert.equal(approval.subject_id, "naeringsliv");
assert.equal(approval.source_ref, candidate.source_ref);
assert.equal(approval.candidate.chapter_count, 12);
assert.equal(approval.gate_summary.total, 5);
assert.equal(approval.gate_summary.passed, 5);
assert.equal(approval.gate_summary.failed, 0);
assert.equal(approval.runtime_activation_allowed, false);
assert.equal(approval.runtime_active_pointer_changed, false);

assert.equal(runtime.active_subjects?.naeringsliv, undefined);
assert.deepEqual(Object.keys(runtime.active_subjects), ["historie", "natur", "politikk"]);
assert.equal(runtime.full_release_active, false);
assert.equal(runtime.effective_entry_count, 47);

const matrixDigest = crypto.createHash("sha256").update(fs.readFileSync(paths.matrix)).digest("hex");
assert.match(matrixDigest, /^[0-9a-f]{64}$/);
console.log("aha-business-fagverk-review tests passed");
'''
write("tests/aha-business-fagverk-review.test.cjs", review_test)

write(
    "docs/AHA_BUSINESS_FAGVERK_REVIEW_V1.md",
    """# AHA Business Fagverk review v1\n\nNæringsliv er gjennomgått som en separat, ikke-aktiv fagpakke fra History Go-commit `c16a187453d16a40f9cab4ca694c32e96014f31b`.\n\nReviewpakken dekker 12 kapitler, 36 modulfiler, et obligatorisk virksomhets-/økonomianker, kapittelspesifikke evidensregler, 36 evalueringscaser og alle 16 canonical AHA-fixturer. Vanlige ord som «arbeid», «marked», «pris», «kunde», «teknologi» og «økonomi» er ikke-skårende alene.\n\nGodkjenningen gjelder bare reviewartefakter. Runtimeaktivisering krever en egen pull request. `full_release_active` og den eksisterende tre-fagsruntimeen endres ikke.\n""",
)

print("Bootstrapped Business Fagverk review sources, matrices, registry, tests and documentation.")
