# AHA Golden Chat Output v1

Status: active release regression gate.

## What this locks

The gate runs all 16 human-reviewed AHA analysis fixtures through the real deterministic JavaScript Chat runtime. It verifies complete output behavior rather than isolated helpers:

- canonical analysis is exactly equal to the reviewed fixture object;
- auto-output type, reflection and summary are unchanged;
- required source-grounded terms remain present;
- unrelated domain terms do not leak into the output;
- the user-visible reply formatter produces the reviewed compact reply shape;
- short prompts still return only the short answer;
- every output remains bound to the exact source hash and analysis run;
- an output from the previous conversation is rejected by the next run.

The baseline is `tests/fixtures/aha-chat-golden-output.v1.json`. Canonical expectations remain owned by the 16 files in `docs/fixtures/aha-analysis/`.

## Review rule

A golden change is not a mechanical snapshot update. If intended analysis behavior changes, the pull request must explain why the new output is better and update both the human-reviewed canonical fixture and the golden runtime baseline where relevant.

Unrelated wording drift, source-hash drift, missing concepts, cross-domain contamination and stale-run acceptance must fail CI.

## Commands

```bash
npm run test:golden-chat-output
npm test
```

The gate is discovered by the ordinary Node test suite and therefore runs in the existing AHA Node tests workflow.
