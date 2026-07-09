# AHA Knowledge Pipeline boundary

The AHA Knowledge Pipeline includes:

- Knowledge Workbench
- Data Intake
- Knowledge Curation
- Knowledge Map
- Graph Intelligence suggestions

This pipeline is local-only and manual.

## Roles

## Knowledge Workbench

Workbench is a local control/status surface. It shows pipeline status and next manual steps.

It is not a knowledge engine, sync engine, backend, training system or EchoNet layer.

## Data Intake

Data Intake creates local candidates from local AHA sources.

Candidates are not knowledge yet.

They require review and consent before they can move into curation or Training Corpus.

## Knowledge Curation

Knowledge Curation groups, deduplicates and prioritizes candidates.

Curation approval is local and manual.

Exporting to Training Corpus must create raw or needs-review material, not trained model data.

## Knowledge Map

Knowledge Map is a derived local graph.

It is not canonical truth.

It must keep source metadata and must not mutate the source modules.

## Graph Intelligence

Graph Intelligence may suggest gaps, links and next review actions.

It must not auto-apply suggestions.

## Not allowed

The pipeline must not:

- call backend
- call AHARepository
- call fetch for remote work
- activate EchoNet
- activate Sync Hub
- auto-train models
- fine-tune models
- write to History Go
- write to the insight chamber
- create source events
- call AHAIngest
- auto-approve material
- treat candidate data as canonical knowledge

## Allowed writes

Allowed local writes:

- `aha_data_intake_queue_v1`
- `aha_knowledge_curation_v1`
- `aha_knowledge_map_v1`
- `aha_knowledge_workbench_status_v1`
- `aha_knowledge_graph_intelligence_v1` if suggestion-only
- Training Corpus only through explicit approved export, and only as raw/needs-review local material

## Current rule

Local candidates → manual review → local curation → explicit export → derived local map.

No automatic training, sync, EchoNet or History Go write-back.
