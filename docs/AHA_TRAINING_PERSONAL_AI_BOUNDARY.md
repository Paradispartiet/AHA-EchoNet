# AHA Training and Personal AI boundary

Training and Personal AI are local-only.

They do not train a model: no model training, no fine-tuning, no upload, no backend services and no EchoNet activation.

## Training Corpus

Training Corpus is a local review corpus.

It stores local AHA material that may be used for:

- retrieval
- context building
- local training example generation
- future local export decisions

Corpus items are not trained model data.

Approval is local and manual.

Fine-tuning consent means only future eligibility for local JSONL export. It does not start fine-tuning.

## Training Examples

Training Examples are local examples generated from approved corpus items.

Examples require review and approval.

Approved export creates local JSONL only (local JSONL export only).

JSONL export does not upload data or start training.

## Personal AI

Personal AI is a local control and test surface.

It may build:

- readiness reports
- local retrieval indexes
- local chat context
- local answer preview packages
- local answer evaluations
- local loop audits

It must not:

- call model APIs
- call backend
- upload training data
- fine-tune
- write to insight chamber
- create source events
- call AHAIngest
- activate EchoNet
- activate Sync Hub
- write to History Go (no History Go write-back)

## Allowed local writes

- `aha_training_corpus_v1`
- `aha_training_examples_v1`
- `aha_personal_ai_control_status_v1`
- `aha_personal_ai_loop_audit_v1`
- `aha_personal_answer_evaluations_v1`
- local retrieval/context status keys if they exist

## Current rule

Local corpus → manual approval → local examples → manual approval → optional local JSONL export → local retrieval/readiness/evaluation.

No automatic training, no upload, no fine-tuning, no backend and no EchoNet.
