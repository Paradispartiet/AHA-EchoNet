# AHA Analysis, Knowledge Map and Products V2 — authoritative integration plan

Status: **approved next-phase plan; implementation not complete**

Date: 2026-08-21

Baseline reviewed: `7e1e460044905dd33c3a988503d850d0e9abe8b6` / PR #884

This document is the authoritative plan for the production chain from active Chat input to analysis, Knowledge Map and the three user products Lists, Paths and Mindmap. It does not reopen or rebuild the nine-block Insight Engine V2 semantic architecture. It defines the remaining production integration, quality and release work.

## Product distinctions

These surfaces must not be conflated:

| Surface | Purpose | Persistence |
|---|---|---|
| Chat analysis | Source-bound interpretation of the active text: overview, insights, concepts, conversation tracks, subject links, sources, source structure and afterwork | Derived analysis state only |
| Knowledge Map | A derived graph of current-analysis knowledge plus explicitly related historical knowledge | Existing local Knowledge Map/Chamber boundary |
| Lists | Thematic user product made from justified, source-bound members | `aha_lists_v1` after explicit save |
| Paths | Pedagogical or narrative user product with ordered progression | `aha_paths_v1` after explicit save |
| Mindmap | Visual artifact with a central idea, meaningful branches, sub-branches and typed cross-links | `aha_concept_lists_v1` after explicit save |

`Kart` in Chat means **Kunnskapskart**. It is not a shorthand for Mindmap. Navigation and action labels must use the full names `Kunnskapskart` and `Tankekart`.

## Audit conclusion

The V2 product mechanics are substantially built:

- `AHASemanticProjectionsV2` is the pure builder;
- `AHAProjectionProductReadModelV2` is the shared immutable product read model;
- `AHAProjectionArtifactQualityV2` quality-filters Lists, Paths and Mindmap;
- Lists, Paths and Mindmap have separate V2 preview surfaces;
- `AHAProjectionMaterializerV2` performs explicit one-artifact local materialization with idempotency and safe undo;
- `ahaAnalysisArtifacts` is a V2-only compatibility wrapper.

The remaining blocking gap is upstream and end-to-end:

- the active Chat analysis still composes legacy auto-output, canonical analysis and afterwork;
- source identity in the live Chat path still depends on a short hash and allows inferred binding in selected paths;
- metadata-only link candidates can become Chamber insights;
- the evaluated semantic shadow document still has empty concepts, claims, relations, tensions and insight candidates, with synthesis correctly blocked;
- `ahaExplorer.js` still renders the legacy analysis shape, including legacy List/Path fields under Structure;
- product runtime visibility depends on matching projection-ready Chamber insights, so a good current analysis may still yield no visible product preview;
- the independent human usefulness gate remains open.

The observed Livsarket analysis exposed the concrete failure class: stale Morgenbladet afterwork and subject links survived into a new analysis, `[object Object]` was rendered as an insight, link metadata became the only stored insight, weak concept tokens were shown, and source/topic checks still reported passed. A hard reload did not repair this because local state survived and PR #884 changed downstream product refinement rather than the legacy Chat analysis chain.

## Target runtime architecture

```text
pasted text + links
        ↓
SourceEnvelopeV2
SHA-256 · analysis_run_id · source precedence · acquisition status
        ↓
SemanticDocumentV2
concepts · claims · evidence · relations · tensions · candidate insights
        ↓
AnalysisBundleV2
one immutable, source-bound analysis
        │
        ├── AnalysisReadModelV2
        │   Overview, Insights, Concepts, Conversation tracks, Subjects,
        │   Sources, Source structure and Afterwork
        │
        ├── KnowledgeMapReadModelV2
        │   Current analysis plus explicitly related historical knowledge
        │
        └── ProjectionProductReadModelV2
            Lists · Paths · Mindmap
                    ↓
            read-only preview
                    ↓ explicit user action
            AHAProjectionMaterializerV2
                    ↓
            normal editable local user product
```

All three read models must receive the same immutable `analysis_id`, `analysis_run_id`, `source_id`, `source_sha256`, semantic IDs, insight references and provenance. Read models never write to product stores. Raw user text remains transient under the existing privacy boundary; durable derived records retain only the minimum source identity, evidence excerpts/offsets and analysis data needed for deterministic reconstruction.

## Required source and analysis invariants

1. Use the existing SemanticDocument SHA-256 as the authoritative source fingerprint throughout the live chain. A short hash may be display-only, never authority.
2. Pasted full text is the primary source. URLs and inaccessible pages are references or metadata sources and must never displace pasted full text.
3. Every generated field carries its original `source_sha256`, `analysis_run_id` and item-level provenance. A consumer must not re-stamp an unbound object with the current identity.
4. Source mismatch, missing provenance or `unknown` isolation status fails closed for derived products. A minimal source-bound analysis may still be shown with an explicit incomplete status.
5. Topic consistency is evaluated per field and per evidence set, not across one flattened bundle where correct fields can mask stale fields.
6. Source events and insights remain different entities. `Kilde registrert`, access status and metadata summaries can never be semantic insights.
7. Historical Chamber/afterwork data is shown only as a separately labelled relation. It can never replace or silently merge into current-source analysis fields.
8. Analysis values are schema-typed before rendering. Objects must never pass through generic string conversion.

## Quality requirements by analysis surface

### Overview

The overview states the actual main theme, central tension, strongest supported insight and next inquiry. Each generated value is traceable to current-source evidence. Metadata tokens and unrelated historical content are forbidden.

### Insights

Show only non-trivial claims with evidence, uncertainty and provenance. Metadata registration, titles copied without interpretation and unsupported generalities are rejected. The view renders the typed insight contract and never `String(object)`.

### Concepts

Lemmatize and collapse morphological variants, remove stopwords and technical type labels, prefer meaningful multiword concepts and retain contextual definitions/evidence. Generic tokens such as `hvordan`, `slik` and `academic_article` are not product concepts.

### Conversation tracks

Generate follow-up questions and tensions only from supported uncertainties, contradictions or relations. Generic prompts are suppressed when the source does not justify them.

### Subject links

Every Fagverk match requires a score, explanation and source evidence. Source references are not evidence for the match. No subject match is a valid result when the threshold is not met.

### Sources

Show pasted text as the primary source and list URLs separately with explicit statuses such as full text used, metadata only, blocked or unused. The UI must distinguish source provenance from insight provenance.

### Source structure

Rename the current `Struktur` semantics to `Kildens struktur`. It may contain problem statement, main claim, evidence/method and central tension. Legacy `Liste` and `Læringssti` output does not belong here.

### Afterwork

Summary, reflection, main thread, unresolved thought and next step are generated only from the active AnalysisBundle. Reuse from earlier afterwork requires an explicit typed historical relation and separate presentation.

## Knowledge Map requirements

Knowledge Map is a derived system graph, not a Mindmap artifact. It must provide:

1. `Denne analysen`: current-source insight, concept and relation nodes;
2. `Hele kunnskapskartet`: relevant historical nodes only through explicit typed relations;
3. visible source/provenance and current-versus-historical origin;
4. no dangling or unexplained edges;
5. no direct `Lagre som tankekart` shortcut that silently materializes the first candidate.

When a user wants a Mindmap from the current analysis, Knowledge Map links to the separate V2 Mindmap preview.

## Product quality requirements

### Lists

- thematic coherence rather than metadata or token collections;
- at least two unique, source-bound members when a List is produced;
- explicit membership reason and semantic basis for every member;
- low redundancy and deterministic deduplication;
- concise, source-specific title.

### Paths

- ordered progression: orientation → claim/evidence → tension/counterexample → uncertainty → synthesis/next inquiry;
- source-specific narrative, transition and learning outcome for every step;
- every step bound to the referenced insight;
- no generic five-step template presented as a finished product.

### Mindmap

- one source-specific central idea;
- 2–7 meaningful ranked branches plus justified sub-branches;
- equivalence collapses duplicate meaning;
- resonance is a typed cross-link, never a normal hierarchy edge;
- balanced hierarchy, bounded noise and no dangling endpoints.

Weak input is allowed to produce no artifact. Suppression is a quality outcome, not an error.

## Product visibility and user journey

Chat gets a separate section named `Produkter fra denne analysen` with three cards: Listeforslag, Stiforslag and Tankekartforslag. Each card has one explicit state:

- `Klar til forhåndsvisning`;
- `Trenger mer belegg`;
- `Ikke relevant for denne teksten`.

Quality-blocked products must not disappear silently. Chat links to preview and passes `analysis_id` plus `projection_id`; it does not materialize the first candidate directly.

Lists and Paths always render their V2 preview shell, including a blocked reason when no candidate passed. Mindmap automatically selects the V2 source when opened through a current-analysis link. Product suggestions remain visually and semantically separate from `Dine lagrede ...`. Saving is offered only inside the product preview and creates one normal editable artifact through the existing materializer.

## Layered release gates

| Gate | Required proof |
|---|---|
| Source | Exact SHA-256/run/source match; all evidence occurs in source; zero inferred re-binding |
| Semantic | Authoritative concepts/claims/relations/tensions; metadata excluded; synthesis gate passed |
| Analysis | Per-field provenance and topic consistency; zero stale fields; zero render/type leaks |
| Product | Product-specific coherence/progression/hierarchy gates; rejected artifacts never shown as passed |
| Journey | Raw Chat input → analysis → preview → explicit save → edit → reload → safe undo |
| Human | At least 80% acceptable artifacts per product type; zero critical provenance errors; independent review complete |

Determinism is required for the same normalized source and engine version. There must be zero automatic product-store, remote, sync, Chamber or Meta writes in the preview chain.

The current 24-case product regression remains valuable for projection determinism, provenance, suppression and zero-write behavior, but is not full production evidence: `makeInsightsFromRawText()` constructs source-bound sentence insights and heuristic concepts after SemanticDocument validation instead of exercising the real Chat → insight → Chamber path. The human ledger remains open.

The release corpus must therefore run 24–30 varied sources through the actual browser flow and include:

- short and long texts;
- research, news, essays, policy, personal reflection and contradictory claims;
- literature/health material such as the Livsarket failure class;
- weak texts where no product is the correct result;
- sequential source A → source B analyses in the same storage context;
- hard reload after source changes;
- inaccessible URL plus pasted full text;
- repeated same-source runs and changed engine versions;
- preview, explicit materialization, edit, reload and undo;
- iPad/Safari responsive and accessibility verification.

## Seven pull requests

### PR 1 — source identity and regression lock

- replace authoritative short-hash use with SemanticDocument SHA-256;
- remove inferred current-source re-binding and fail closed on unbound payloads;
- enforce pasted-text-over-link-metadata precedence;
- block metadata candidates from insight creation;
- add the sequential Morgenbladet → Livsarket → reload regression;
- assert no stale text, `[object Object]`, metadata insight, unsupported Fag match or false quality pass.

### PR 2 — authoritative AnalysisBundleV2

- add one immutable schema-validated bundle per analysis run;
- require item-level provenance for every analysis surface;
- eliminate blind canonical/payload/afterwork merging;
- provide typed values to every consumer.

### PR 3 — authoritative live semantic bridge

- populate SemanticDocument concepts, claims, relations, tensions and candidate insights from actual Chat input;
- run the synthesized-insight quality gate in the live path;
- remove or visibly block unsupported heuristic synthesis;
- make current source-bound insights available without depending on an unrelated legacy Chamber record.

### PR 4 — analysis UI and Knowledge Map separation

- make `ahaExplorer.js` consume AnalysisReadModelV2;
- repair Overview, Insights, Concepts, Conversation tracks, Subjects, Sources, Source structure and Afterwork;
- introduce KnowledgeMapReadModelV2 with current/historical separation;
- use `Kunnskapskart` and `Tankekart` consistently in UI and navigation;
- remove legacy List/Path output from Structure and direct first-candidate materialization from Knowledge Map.

### PR 5 — projection bridge and visible product states

- let `AHAProjectionRuntimeSourceV2` consume the approved active AnalysisBundle;
- add the three product status cards and stable analysis/projection deep links;
- keep Lists/Paths preview shells visible with blocked reasons;
- select V2 Mindmap automatically when entered from Chat;
- preserve the read-only/no-product-write boundary.

### PR 6 — product usefulness and real evaluation

- preserve PR #884 source-bound refinements and deterministic deduplication;
- calibrate List membership, Path progression and Mindmap hierarchy against the real corpus;
- run the full browser E2E matrix in shared/sequential storage contexts;
- complete independent human review and meet every release gate.

### PR 7 — controlled save journey and compatibility cleanup

- verify preview → save → edit → reload → safe undo for all three products;
- retain idempotency by `projection_id + artifact_id` and existing local stores;
- keep automatic, remote, sync, Chamber and Meta writes closed;
- remove remaining legacy artifact presentation and domain-specific patches only after proven parity;
- leave `ahaAnalysisArtifacts` as a thin V2 compatibility wrapper or remove it once no caller needs it.

## Definition of done

The phase is complete only when all of the following are true:

1. One active source produces one immutable source-bound analysis with no stale fields.
2. Chat analysis, Knowledge Map and all three product previews share the same analysis/projection identity.
3. Knowledge Map and Mindmap are visibly and technically separate products.
4. Lists, Paths and Mindmap either show a qualified preview or a precise suppression reason.
5. A selected preview can be saved once, edited as a normal product, reloaded and safely undone when unchanged.
6. The real-browser corpus and independent human gate pass with at least 80% acceptable artifacts per product type and zero critical provenance errors.
7. No automatic write authority has been widened.

Until these conditions pass, documentation must describe the semantic build and V2 product mechanics as implemented, but the complete live `input → analysis → Knowledge Map/products` production chain as unfinished.
