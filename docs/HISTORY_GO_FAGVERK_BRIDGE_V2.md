# AHA ↔ History-Go Fagverk Bridge V2

Status: canonical consumer contract

## Authority

History-Go owns the Fagverk. AHA does not own a parallel subject taxonomy, curriculum, chapter corpus or canonical subject-ID list.

The AHA bridge is pinned to one exact History-Go commit in `data/integrations/history-go-fagverk-bridge.v2.json` and resolves the canonical package through:

- `data/fagverk/fagverk_release.json` — integrity and completeness metadata;
- `data/fagverk/subject_inventory.json` — root subjects and specializations;
- `data/fag/fag_manifest.json` — canonical package paths, including `emner`, `pensum`, `fagkart` and `methods`;
- `data/fagverk/fagverk_registry.json` — chapter metadata and chapter paths.

The bridge must fail closed when this pinned package cannot be loaded or when release digests/counts differ from the bridge contract.

## Runtime model

`AHASubjectEngine` derives subject IDs from History-Go `subject_inventory`. It loads canonical `emner` through History-Go `fag_manifest` and keeps History-Go repo/ref/path provenance on every canonical match.

`data/subjects/subjects_index.json` is **overlay-only**. It may map AHA-specific local knowledge onto one or more canonical History-Go subjects, but it may not:

- introduce a competing canonical subject list;
- rename a canonical History-Go subject;
- replace canonical History-Go emner;
- make a stale local/runtime copy authoritative.

Any old `emne.fagverk` projections already present in local subject JSON are ignored by the V2 engine. Only genuinely AHA-owned overlay entries may augment the canonical subject.

`js/emnerLoader.js` is a compatibility facade and delegates to `AHASubjectEngine`; it no longer owns an `EMNER_INDEX`.

## Legacy integration artifacts

The older files under `data/integrations/runtime/history-go-fagverk-*` and the former partial runtime registry are compatibility/evidence artifacts. They are **not semantic authority** for AHA V2 and must never be used as fallback when the canonical package is unavailable.

`scripts/materialize-history-go-fagverk-subjects.mjs` no longer writes canonical History-Go chapter copies into `data/subjects`. It validates the bridge and overlays only. This prevents a future regeneration from recreating the former 8-subject/12-subject split.

## Refresh procedure

When History-Go Fagverk changes:

1. verify the History-Go release is complete and has zero missing files;
2. choose the exact History-Go commit to consume;
3. update the bridge `source_ref` and expected release digests/counts together;
4. run the AHA Node suite, launch gate and browser/product gates;
5. merge only when provenance remains exact and the canonical bridge regression is green.

AHA must never point this bridge at mutable `main` at runtime.

## Product boundary

Fagverk matches are reference/support links, not evidence for claims about the user's source. History-Go knowledge may help classify, explain or connect an analysis, but it cannot replace the pasted/imported source evidence required by the V2 insight gates.

No automatic Chamber, canonical, product, Meta, remote or sync write authority is opened by this bridge.
