# AHA module API boundary v1

Status: active for the launch-critical insight pipeline.

## Purpose

AHA is still delivered as browser scripts without a build step. The v1 boundary gives those scripts an explicit, versioned module contract while the application moves away from unrestricted `window.*` coupling.

The registry is loaded from `js/ahaModuleApi.js` before registered modules. Modules publish named exports with:

```js
window.AHAModuleApi.register("ingest", implementation, {
  version: 1,
  legacyGlobal: "AHAIngest",
  exports: ["ingest", "ingestWithCandidates"]
});
```

Consumers resolve the public facade rather than reaching into another module's implementation:

```js
const ingest = window.AHAModuleApi.resolve("ingest", "AHAIngest", { version: 1 });
```

The legacy name is an intentional compatibility fallback during migration. New cross-module dependencies must register and resolve a named API. They must not add new implicit globals.

## v1 guarantees

- Module names and positive integer versions are validated.
- A module name cannot be silently registered twice with a different implementation.
- Public facades are frozen and expose only declared names.
- Function references on a facade are stable and delegate to the current implementation.
- Registry metadata does not reveal implementation objects.
- Loading the registry more than once is safe.
- Version mismatches fail explicitly.

The registered surface covers `insights`, `metaInsights`, `sources`, `repository`, `emneMatcher`, `embeddings`, `ingest`, `contracts`, `chat`, `chat.insightFeedback`, `historyGo.contract`, `historyGo.import`, and `historyGo.status` on pages where those modules are loaded. The extracted Chat providers also register under `chat.*`: text utilities, signals, academic analysis/source-grounding policy, concept canonicalization/graph-prioritization policy, the versioned analysis-run contract, academic context and synthetic insight view, subjects, analysis, export, reply formatting, memory controls/runtime, afterwork, run context, insight/knowledge views, insight pipeline, Personal UI, auto analysis/output view, and canonical analysis.

## Candidate-ingest extension point

Code outside `ahaIngest.js` must not replace `ingestWithCandidates`. Candidate processing is extended through:

- `useCandidateMiddleware(id, handler, { priority })`
- `removeCandidateMiddleware(id)`
- `hasCandidateMiddleware(id)`
- `listCandidateMiddlewares()`

Lower priority runs first and therefore wraps later processing. A handler receives frozen `{ input, candidates }` context and an explicit `next(input, candidates)` function. It may call `next` once. Duplicate middleware IDs fail instead of overwriting existing behavior.

Current order:

1. `chat.insightFeedback` at priority 50 (renders after `next` returns)
2. `contracts.insightQuality` at priority 100 (normalizes before canonical ingest and enriches its result)
3. canonical candidate ingest

## Compatibility and migration

Legacy globals remain available in v1 because some secondary surfaces have not yet migrated. They are compatibility aliases, not the public contract. Migration can proceed one consumer at a time:

1. Register the provider's smallest useful named surface.
2. Resolve it through `AHAModuleApi` with an explicit version.
3. Keep the legacy fallback until all relevant pages load the registry first.
4. Remove the fallback in a later, separately tested boundary version.

The v1 regression test locks registry semantics, middleware ordering, non-overwrite behavior, and page load order.
