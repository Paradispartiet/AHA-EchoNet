# AHA Semantic Evaluation — Phase 3B Status — 2026-08-19

```text
Phase 1A — evidence/provenance                    merged
Phase 1B — entities/concepts                      merged
Phase 1C — claims/relations                       merged
Phase 2A — semantic model contract                merged
Phase 2B — semantic model endpoint                merged
Phase 2C — semantic model shadow bridge           merged
Phase 3A — semantic evaluation/quality gate       merged
Phase 3B — gold evaluator + evaluation runtime    implemented on this branch
```

Phase 3B legger til:

- `AHASemanticGoldEvaluator`
- håndmerkede semantic gold fixtures
- reelle precision/recall/F1-mål separert fra agreement
- `AHASemanticEvaluationRuntime`
- source-event/hash revalidation før runtime-evaluering
- metadata-only evaluation shadow event-kontrakt

Ingen produksjonsport åpnes:

```text
production_gate_authority = false
synthesis_allowed = false
canonical_write = false
meta_write = false
persistent_write = false
```

`chat.html` endres ikke i Phase 3B. Minimal runtime-wiring gjøres først etter at denne kontrakten og testene er grønne.
