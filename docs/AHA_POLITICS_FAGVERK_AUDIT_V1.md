# AHA Politics Fagverk Audit V1

## Status

Politics Fagverk Audit V1 is the first full subject-scoped production gate for AHA Fagverk grounding.

It materializes and audits all thirteen canonical Politics chapters registered in History Go, including all three registered module files per chapter. The checked-in output is a **review corpus**, not an active runtime corpus. It remains blocked from AHA analysis until shared terms, chapter boundaries and evaluation cases have been reviewed.

## Locked source

Repository:

```text
Paradispartiet/History-Go
```

Commit:

```text
9e9644e83998ff715005bf80c96cde6193107c13
```

Registry:

```text
data/fagverk/fagverk_registry.json
```

Registry version:

```text
2.19.0
```

The registry declares thirteen source- and claim-traced Politics chapters.

## Canonical chapter set

1. `forvaltning` — Offentlig forvaltning
2. `parlamentarisme` — Parlamentarisme, representasjon og offentlighet
3. `regimer-og-institusjoner` — Regimer og institusjoner
4. `valg-partier-velgeratferd` — Valg, partier og velgeratferd
5. `offentlig-politikk-beslutning-implementering` — Offentlig politikk, beslutning og implementering
6. `internasjonal-politikk-sikkerhet-samarbeid` — Internasjonal politikk, sikkerhet og samarbeid
7. `politisk-okonomi-stat-marked` — Politisk økonomi, stat og marked
8. `statsvitenskapelig-metode-og-sammenligning` — Statsvitenskapelig metode og sammenligning
9. `norsk-politikk-eos-eu-flernivastyring` — Norsk politikk, EØS/EU og flernivåstyring
10. `rett-lov-rettssikkerhet` — Rett, lov og rettssikkerhet
11. `fordeling-velferd-ulikhet` — Fordeling, velferd og ulikhet
12. `konflikt-makt-sivilsamfunn` — Konflikt, makt og sivilsamfunn
13. `normer-identitet-hverdagsliv` — Normer, identitet og hverdagsliv

## Module-depth correction

The first production artifact revealed that top-level chapter files alone were not sufficient. Many chapters produced no support terms because the explanatory paragraphs, key points and concepts live in registered module files.

The builder now resolves every path in `moduleFiles` and uses module content from:

- sections and paragraphs
- key points
- module concepts and definitions
- worked examples
- application tasks
- self-check material
- case studies and methods when present

Claim IDs, source IDs, file paths and other provenance identifiers are excluded from semantic term extraction.

The locked Politics source contains:

```text
13 chapters
39 module files
3 module files per chapter
```

Every checked-in chapter entry therefore records:

- one chapter source path
- three module source paths
- module file count `3`
- module-derived concepts
- a 48-term support window derived from the chapter and module prose

## Builder contract

```bash
node scripts/build-history-go-fagverk-corpus.mjs \
  --history-go-root ../History-Go \
  --subject politikk \
  --expected-count 13 \
  --output artifacts/history-go-fagverk-politikk.audit.v1.json \
  --audit-output artifacts/history-go-fagverk-politikk.audit-report.v1.json
```

`--subject politikk` is a hard scope filter. No History, Nature or other subject entry may appear in the generated corpus.

`--expected-count 13` is a coverage gate. The build fails when either the registry or the materialized corpus differs from thirteen chapters.

## Coverage gate

The audit fails when it finds:

- a missing registered chapter
- a missing registered module file
- an unexpected corpus chapter
- a duplicate subject/chapter identity
- a registry count other than thirteen
- a materialized count other than thirteen
- an unknown subject filter
- a registered chapter file that cannot be resolved

The audit records exact chapter and module source paths and the locked History Go commit for every production run.

## Checked-in review artifacts

The deterministic review files are checked in at:

```text
data/integrations/review/history-go-fagverk-politikk.audit.v1.json
data/integrations/review/history-go-fagverk-politikk.audit-report.v1.json
```

Corpus content digest:

```text
981ab3ad25f972bd13c70a0247f26b8796e43b8cd3cde7282b7d073bfcc79dec
```

The CI workflow regenerates both files from the locked History Go source and requires byte-for-byte parity with the checked-in review artifacts. The workflow has read-only repository permissions and cannot update the branch.

## Collision audit result

Terms are inspected across:

- `title_terms`
- `concept_terms`
- `support_terms`

A term becomes a collision when it appears in more than one chapter.

Risk levels:

- `high`: a single-token term shared by three or more chapters
- `medium`: a single-token term shared by two chapters
- `low`: a multi-token phrase shared by multiple chapters

The module-aware Politics audit currently reports:

```text
143 shared terms total
64 high-risk single-token terms
75 medium-risk single-token terms
4 shared multi-token phrases
```

The high-risk list includes two different problems.

### Generic language noise

Examples:

- `derfor`
- `men`
- `faktisk`
- `hvem`
- `samme`
- `bare`
- `både`
- `hvorfor`

These words occur frequently in explanatory prose but should not contribute to chapter selection.

### Real cross-chapter political vocabulary

Examples:

- `institusjoner`
- `makt`
- `politikk`
- `politisk`
- `regler`
- `representasjon`
- `ressurser`
- `kontroll`
- `ansvar`
- `prosessporing`

These are genuine subject terms, but they are too broad to identify one chapter alone. They must be removed from scoring, down-weighted or required as part of a chapter-specific phrase before runtime activation.

## Runtime boundary

This audit does not:

- replace the active seed corpus
- activate all Politics chapters in `/api/aha/analyze`
- change grounding thresholds
- perform model training or fine-tuning
- fetch History Go at runtime
- write back to History Go
- activate sync or EchoNet
- store source articles

The Python runtime continues to load:

```text
data/integrations/history-go-fagverk-corpus.v1.json
```

It does not load anything under `data/integrations/review/`.

## Acceptance before runtime activation

Politics grounding may be activated only after:

1. 13/13 chapter coverage remains green
2. all 39 registered module files remain represented
3. generic language noise is excluded from scoring
4. broad Politics vocabulary is blocked, down-weighted or phrase-bound
5. each chapter has positive evaluation cases
6. each chapter has nearby negative or confusing cases
7. cross-chapter ambiguity cases remain `ambiguous`
8. non-Politics texts remain unsupported
9. old article-template leakage is absent
10. the comparison audit records old output, grounded output and human expectation

## Next production step

The next PR is the Politics term-review and evaluation-matrix batch. It must classify all 143 collisions, create a non-scoring term policy and add positive, negative and ambiguity cases per chapter. Runtime activation remains a separate later PR.
