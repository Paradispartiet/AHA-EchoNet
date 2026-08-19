# AHA Semantic Evaluation Shadow Operator V1

## Status

Phase 3C gir en eksplisitt QA-flate for hele semantic-shadow-kjeden uten å endre normal `chat.html`.

```text
operator: semantic-evaluation-shadow.html
normal chat modified: no
semantic model shadow: opt-in
quality gate: shadow-only
evaluation runtime: memory-only
canonical write: false
Meta write: false
persistent write: false
synthesis allowed: false
```

## Flyt

Operatorflaten åpner same-origin:

```text
chat.html?ahaSemanticModelShadow=1
```

Etter at chat-iframe er lastet injiseres, i denne rekkefølgen:

```text
ahaSemanticInsightQualityGate.js
ahaSemanticEvaluationRuntime.js
ahaSemanticEvaluationBootstrap.js
```

`ahaSemanticModelShadowBridge.js` er allerede lastet av den ordinære chatten og aktiveres bare av det eksplisitte QA-flagget.

## Bootstrap

`ahaSemanticEvaluationBootstrap.js`:

- løser `semanticEvaluationRuntime@1`
- oppretter én runtime-instans
- eksponerer den som `AHASemanticEvaluationShadowRuntime`
- binder `aha:semantic-model-shadow`
- er idempotent
- er safe no-op hvis runtime-modulen mangler

Bootstrap gjør ingen nettverkskall eller lagring.

## Operator-output

Foreldresiden lytter på:

```text
aha:semantic-evaluation-shadow
```

og viser bare sikker metadata:

- source event-id
- valid-status
- evaluation metrics
- gate metadata

Den viser ikke full source, proposition text, evidence quotes eller model shadow.

## Hvorfor vi ikke endrer chat.html ennå

Normal AHA Chat skal ikke få ny load-order eller ekstra QA-kode før den nye semantiske kjeden har vært observert gjennom en eksplisitt operatorflyt.

Dette gir en kontrollert sekvens:

```text
contract
→ endpoint
→ model shadow
→ quality gate
→ gold/runtime
→ explicit operator QA
→ først deretter vurder normal runtime-wiring
```

## Testkontrakt

Regresjonene låser:

- iframe bruker eksplisitt `ahaSemanticModelShadow=1`
- gate lastes før runtime
- runtime lastes før bootstrap
- bootstrap binder én runtime-instans
- operatoren har ingen localStorage/Supabase/canonical-write
- normal `chat.html` er ikke en del av denne PR-diffen

## Neste etappe

Kjør representative source-tekster gjennom operatorflaten og utvid gold-settet med negative cases. Først når faktisk model shadow og gold-metrikk er tilfredsstillende kan vi vurdere om evaluation-runtime skal lastes i normal AHA Chat.
