# AHA Fagverk Grounding V1

## Status

AHA Fagverk Grounding V1 is a source-bound interpretation layer for the AHA engine.

It uses reviewed `History-Go/data/fagverk/**` chapters as a **reference and evaluation corpus**. It does not treat the chapters as automatic model-training truth, does not fine-tune a model, and does not write anything back to History Go.

## Why this exists

The current Python analyzer contains several hand-authored keyword paths and prepared summaries for a small set of article examples. That is useful as a deterministic fixture baseline, but it can misread new texts by selecting a familiar article template or by falling back to a generic academic interpretation.

Fagverk provides a better foundation because the chapters contain structured, reviewed fields such as:

- subject and chapter identity
- title, subtitle and lead
- learning objectives
- diagnostic questions and answers
- concepts and definitions
- key points
- common misconceptions and corrections
- worked examples and application tasks
- source and provenance metadata

V1 uses those structures to answer a narrower question first:

> Which reviewed Fagverk chapter is directly supported by the words and concepts in the current source text?

It does not claim to solve open-ended interpretation by itself.

## Three separate layers

### 1. Reference corpus

The generated corpus is a compact derivative of canonical History Go Fagverk chapters. Every entry keeps:

- `subject_id`
- `chapter_id`
- `primary_domain_id`
- title
- source path
- weighted terms
- source repository and source commit
- review/provenance status

The corpus must be regenerated explicitly from a local History Go checkout. AHA does not fetch or scan History Go at runtime.

### 2. Evaluation corpus

Evaluation cases define what AHA must and must not infer. They include:

- correct subject and chapter matches
- weak evidence that must remain unsupported
- ambiguous evidence that must not be auto-resolved
- cross-domain leakage checks
- personal text that must not be forced into an academic chapter

Adding more articles without adding correction/evaluation cases is not considered engine training.

### 3. Runtime grounding

Runtime grounding is conservative:

1. normalize the current source only
2. score explicit Fagverk terms
3. require at least two independent matched terms and a minimum score
4. refuse a match when two chapters are too close
5. attach chapter provenance through a `fagverk_chapter` History Go link
6. replace the old generic fallback only when the original domain confidence is low

The existing specialized analyzer remains available. V1 does not silently overwrite a high-confidence specialized result.

## Confidence rule

Grounding confidence measures evidence for the **chapter match**, not truth of the full interpretation.

A high chapter score must not automatically produce high confidence for:

- motive
- causation
- main tension
- normative conclusion
- diagnosis
- historical linkage not present in the source

When V1 replaces the generic fallback, it explicitly states that more detailed interpretation still requires direct source evidence.

## Training rule

The word “training” is reserved for three different activities:

- **grounding:** retrieve reviewed reference material for the current text
- **evaluation:** measure whether the engine reads known examples correctly
- **model training/fine-tuning:** change model parameters

This PR implements the first two. It does **not** implement model training or fine-tuning.

Fine-tuning must not begin until there is a reviewed correction set containing, for each example:

- source text or permitted source representation
- expected content type
- expected subject/chapter
- supported concepts
- unsupported interpretations
- required uncertainty
- reviewer and revision metadata

## Privacy and product boundary

Fagverk Grounding V1:

- reads a checked-in compact corpus
- reads one current analysis message
- performs no network calls
- performs no browser-storage discovery
- performs no sync
- performs no EchoNet action
- performs no backend persistence
- performs no History Go write-back
- stores no article text in the Fagverk corpus

## Build command

From the AHA-EchoNet repository:

```bash
node scripts/build-history-go-fagverk-corpus.mjs \
  --history-go-root ../History-Go
```

The builder reads `data/fagverk/fagverk_registry.json`, resolves registered chapter files and writes a deterministic compact corpus to:

```text
data/integrations/history-go-fagverk-corpus.v1.json
```

The checked-in V1 file is a reviewed seed. It proves the contract with Nature, Politics and History chapters. The next corpus-refresh PR should run the builder against current History Go and review the full generated diff before merge.

## Acceptance gates

A grounding change is acceptable only when:

- Python engine tests pass
- the evaluation cases pass
- unsupported text stays unsupported
- ambiguous matches stay ambiguous
- no raw article archive is added
- provenance points to an exact History Go commit
- no runtime network or write path is introduced

## Next step

After the full Fagverk corpus is generated and reviewed, the next engine PR should add a scored comparison report between:

- current hard-coded analyzer output
- Fagverk-grounded output
- human-reviewed expected output

Only then should we decide whether retrieval is sufficient or whether a supervised model/fine-tune track is justified.
