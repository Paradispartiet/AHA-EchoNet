# AHA Insight Synthesis V2 — controlled local activation

Date: 2026-08-20

## Status

The stable two-round production result now feeds a separate, operator-only
activation boundary. The synthesis endpoint and Insight Quality Gate V2 remain
shadow-only and keep all write fields `false`.

The activation boundary enables exactly this sequence:

```text
eligible in-memory V2 candidate
→ validate exact permanent production proof
→ validate current source hash
→ explicit one-time approval
→ dedicated local review queue
→ validate review integrity and current source hash again
→ second explicit one-time approval
→ append exactly one local Chamber insight
→ optional explicit, signature-bound rollback
```

It does not enable automatic synthesis writes, normal Chat wiring, backend
sync, Supabase persistence, Meta writes, EchoNet sharing, or persistent
SemanticDocument storage.

## Permanent production proof

The controller accepts only the locked proof from:

```text
tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/
```

The required identity is:

```text
workflow run:    32366046900
artifact id:     9405381366
artifact digest: sha256:0284594f709bf224076f2a93e9d7cdb9c200d91c8bbc8aec92f7fc040337dbac
production main: 02521a405c46294f40e7a9361564cde120e656a0
rounds:          2
valid outputs:   6 / 6, 6 / 6
V2 F1:           1.0, 1.0
stable:          true
```

Any identity, count, F1, stability or measurement-policy mismatch stops the
activation before a write.

## Operator surface

The dedicated surface is:

```text
insight-activation-v2.html
```

Normal `chat.html` does not load the activation controller or operator adapter.
The page embeds the existing Chat runtime with the two shadow flags, then loads
the activation layer only into that iframe.

The operator must complete two different approval challenges:

1. approve the displayed candidate into `aha_insight_review_queue_v2`;
2. approve that reviewed record into `aha_insight_chamber_v1`.

Challenges are memory-only, exact-string, single-use, and expire after ten
minutes. A failed attempt consumes the challenge.

## Review record and integrity

The local review record contains:

- source event ID and SHA-256 source binding;
- deterministic and model response provenance;
- the complete candidate and exact evidence spans;
- the complete gate decision and metrics;
- the locked production-proof identity;
- a candidate signature.

Before canonical promotion, the controller recalculates the signature and
rechecks the current source text hash. A modified queue record or stale source
is rejected.

## Bounded Chamber write

Promotion constructs the Insight through the existing `InsightsEngine` in an
isolated empty chamber. It then appends that one generated object to the real
local chamber. Existing insights are never reinforced or rewritten by this
flow.

The object carries an `activation_v2` envelope with evidence, causal status,
gate metrics, proof identity and these hard boundaries:

```text
backend_sync_allowed = false
meta_write_allowed = false
```

`ahaChamberSync` checks this marker before either push or pull. If a controlled
local V2 record is present, reconciliation stops before any repository call.
This also prevents a later login or unrelated Chamber save from indirectly
publishing the record.

## Audit and rollback

Application audit events are stored under:

```text
aha_insight_activation_audit_v2
```

The log stores IDs, action, outcome, timestamp, signatures and failure reason;
it does not copy source text or candidate text. Every event includes the prior
event hash and its own SHA-256 hash. Any modification breaks the chain and
stops subsequent controller operations.

Rollback requires a third one-time challenge. It removes an insight only when
all of these still match:

- canonical Insight ID;
- review ID;
- stored canonical signature;
- recalculated signature for the complete canonical Insight record.

Other Chamber insights are left untouched. The review record changes to
`rolled_back`, and the rollback is appended to the audit chain.

## Fail-closed cases locked by tests

The test suite covers:

- incorrect and reused approval phrases;
- missing or changed permanent proof;
- shadow/gate policy drift;
- ineligible candidates;
- duplicate review and canonical promotion;
- source changes between prepare and approval;
- review-record modification;
- canonical-record modification before rollback;
- audit-chain modification;
- storage verification and compensating restoration;
- preservation of unrelated Chamber insights;
- zero repository push/pull while a local-only V2 record exists;
- absence of the activation runtime from normal Chat.

Primary regressions:

```text
tests/aha-insight-activation-v2.test.cjs
tests/aha-insight-activation-operator-v2.test.cjs
tests/aha-chamber-sync-insight-activation-v2.test.cjs
```

## Remaining closed authorities

This phase intentionally leaves these gates closed:

```text
automatic canonical synthesis writes
backend/persistent Chamber publication of V2 records
Meta derivation or Meta writes from V2
normal Chat activation
multi-candidate or batch promotion
persistent SemanticDocument writes
```

Each requires a separate proof and activation decision.
