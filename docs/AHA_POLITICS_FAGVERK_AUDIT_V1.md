# AHA Politics Fagverk Audit V1

## Status

Politics Fagverk Audit V1 is the first full subject-scoped production gate for AHA Fagverk grounding.

It materializes and audits all thirteen canonical Politics chapters registered in History Go, but it does **not** activate the generated corpus in the AHA runtime. The output remains review-gated until shared terms, chapter boundaries and evaluation cases have been inspected.

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

## Builder contract

The corpus builder now accepts:

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
- an unexpected corpus chapter
- a duplicate subject/chapter identity
- a registry count other than thirteen
- a materialized count other than thirteen
- an unknown subject filter
- a registered chapter file that cannot be resolved

The audit records exact source paths and the locked History Go commit for every production run.

## Collision audit

Terms are inspected across:

- `title_terms`
- `concept_terms`
- `support_terms`

A term becomes a collision when it appears in more than one chapter.

Risk levels:

- `high`: a single-token term shared by three or more chapters
- `medium`: a single-token term shared by two chapters
- `low`: a multi-token phrase shared by multiple chapters

High-risk terms are not automatically removed because their meaning depends on where and how they occur. They must instead be reviewed against chapter-specific phrases and evaluation texts. Typical Politics risks are expected around broad words such as power, state, institutions, responsibility, representation, rules and rights.

## Generated artifacts

The workflow produces:

```text
history-go-fagverk-politikk.audit.v1.json
history-go-fagverk-politikk.audit-report.v1.json
```

The first file contains the deterministic thirteen-chapter corpus.

The second file contains:

- coverage status
- all chapter identities and source paths
- term counts per chapter
- all shared terms
- high-risk shared terms
- activation recommendation
- gate errors, when present

Artifacts are retained for review and are not automatically committed or loaded by the AHA engine.

## Runtime boundary

This audit does not:

- replace the active seed corpus
- activate all Politics chapters in `/api/aha/analyze`
- change scoring thresholds
- perform model training or fine-tuning
- fetch History Go at runtime
- write back to History Go
- activate sync or EchoNet
- store source articles

## Acceptance before runtime activation

Politics grounding may be activated only after:

1. the artifact proves 13/13 registry coverage
2. every high-risk term is reviewed
3. generic terms are removed, down-weighted or made phrase-dependent where required
4. each chapter has positive evaluation cases
5. each chapter has nearby negative or confusing cases
6. cross-chapter ambiguity cases remain `ambiguous`
7. non-Politics texts remain unsupported
8. old article-template leakage is absent
9. the comparison audit records old output, grounded output and human expectation

## Next production step

After the artifact is generated, the next PR must materialize a reviewed Politics corpus and an evaluation matrix. It should not activate runtime matching until the collision review and chapter-level positive/negative cases are complete.
