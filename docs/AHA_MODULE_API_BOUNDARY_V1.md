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

The registered surface covers `insights`, `metaInsights`, `sources`, `repository`, `emneMatcher`, `embeddings`, `ingest`, `contracts`, `chat`, `chat.insightFeedback`, `historyGo.contract`, `historyGo.import`, and `historyGo.status` on pages where those modules are loaded. The extracted Chat providers also register under `chat.*`: text utilities with canonical source identity and keyword primitives, the versioned chamber store, signals, academic analysis/source-grounding policy, concept canonicalization/graph-prioritization policy, the versioned analysis-run contract, academic context and synthetic insight view, subjects, analysis, export, reply formatting, memory controls/runtime, afterwork, run context, insight/knowledge/conversation views, the insight pipeline with canonical functional types and candidate-quality policy, the agent runtime with its memory-gated request and HTTP boundary, the ingest runtime with canonical routing and one explicit legacy fallback, Personal UI, UI runtime/bootstrap, auto analysis, the versioned auto-output store, auto-output view/runtime, analysis-state view, canonical analysis, runtime composition, and application composition.

`chat.memoryControls` has one explicit two-phase view boundary: `bindView(...)`
connects its change notifications after `chat.personalUi` has been created. This
keeps the initialization order visible without mutable Personal UI placeholders
or late-binding wrapper functions in `ahaChat.js`.

`chat.export.createRuntime(...)` binds the export pipeline to the active analysis,
stores, DOM reply fallback and academic afterwork policy once during Chat startup.
The runtime facade is frozen and owns bundle, Markdown, clipboard and JSON export
entry points; `ahaChat.js` only wires the declared dependencies.

`chat.autoOutputView.create(...)` owns output sanitization, History Go suggestion
cards, literary cross-domain filtering and source-aware topic-mismatch handling.
Its frozen facade exposes these policies to `chat.autoOutputView.createRuntime(...)`
without parallel implementations in `ahaChat.js`.

`chat.uiRuntime.createShell(...)` owns the small shared browser shell: theme and
field context, status/output targets, auxiliary and main panel writes, HTML
escaping, display-text normalization, the active-insight query, concept-label
adaptation, category-chip suggestions, debounced Explorer refresh and the local
chat-memory status. The returned facade is frozen and keeps these browser
adapters out of `ahaChat.js`.

`chat.canonicalAnalysis.create(...)` owns History Go link normalization together
with canonical synthesis. This keeps alias handling, stable IDs and duplicate
suppression on the same side of the canonical-analysis boundary.

`chat.runtimeFacade.create(...)` installs the browser compatibility aliases,
memory/debug consoles, active-run facade, test hooks, public `chat` API and the
DOMContentLoaded bootstrap from one declared binding table. Export whitelists
live in the module, so `ahaChat.js` no longer duplicates or directly installs
the public runtime surface.

`chat.runtimeComposition.create(...)` owns the final application wiring between
the already versioned export, auto-output, reply policy, Meta-AI, submission,
knowledge-view, UI and runtime-facade modules. It accepts an explicit module map,
configuration and six responsibility-owned capability groups (`core`,
`persistence`, `analysis`, `execution`, `memory`, `view`). Each group is
allowlisted and type-validated before composition; undeclared capabilities are
not forwarded to the public runtime facade. The module contains no analysis or
import engine logic.

`chat.providerLoader` is the canonical manifest for Chat provider names, legacy
aliases and required factory methods. `chat.applicationComposition` resolves and
instantiates the provider graph through this boundary, while non-Chat core modules
still use the same version-1 registry with their explicit legacy fallback.

`chat.capabilityBindings` is the canonical allowlist for the provider-instance
surfaces consumed by the Chat composition root. Each named group validates its
required functions or values, returns a frozen facade, renames storage and shell
adapters where needed, and excludes undeclared provider internals. Provider
loading/factory ownership remains in `chat.providerLoader`; capability ownership
does not move analysis, import or persistence logic into the composition root.

`chat.applicationComposition.create(...)` owns provider factory order, the
two-phase memory-view binding, grouped runtime capabilities and the small set of
late callbacks required to break initialization cycles. Browser environment
access enters through five explicit adapters. It returns one frozen `install`
facade; `ahaChat.js` is limited to resolving the provider loader, supplying those
environment adapters and installing the composed application exactly once.

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
