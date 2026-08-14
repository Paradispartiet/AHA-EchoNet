# AHA Database

AHA-EchoNet har et eksisterende, valgfritt Supabase/PostgreSQL-lag og et nytt canonical schema-grunnlag. De må ikke forveksles.

## Statusoversikt

| Lag | Status | Runtime |
|---|---|---|
| `public.aha_*` / `public.music_*` | Eksisterende Supabase-MVP | Valgfritt aktivt per modul |
| `public.aha_insight_chambers` | Legacy chamber-sync som JSONB | Valgfritt aktivt |
| `public.aha_insight_embeddings` | Første pgvector-lag | Valgfritt aktivt |
| `aha.*` | Canonical PostgreSQL Schema v1 | **Ikke aktivert** |

Backendretningen er dokumentert i:

```text
docs/AHA_BACKEND_FOUNDATION_ROADMAP_V1.md
docs/adr/README.md
docs/AHA_CANONICAL_POSTGRESQL_SCHEMA_V1.md
docs/AHA_LOCAL_TO_CANONICAL_MAPPING_V1.md
```

Runtime-kode og grønne kontraktstester beskriver hva som faktisk kjører. Canonical schema og ADR-er beskriver neste migreringsgrunnlag; de aktiverer ikke cloudlagring eller EchoNet alene.

## Dagens databasekode

Dagens database-lag er et tillegg til localStorage-MVP-en:

```text
localStorage fungerer alltid
Supabase brukes hvis konfigurert og bruker er innlogget
appen skal ikke krasje hvis Supabase mangler
```

### Filer

```text
ahaDb.js
= bootstrap for Supabase-klient

ahaAuth.js
= Supabase Auth-bro og auth-ready event

ahaRepository.js
= database-save og database-read for eksisterende MVP-tabeller

ahaChamberSync.js
= toveis sync av hele insight-kammeret mellom localStorage og Supabase

supabase/schema.sql
= eksisterende public.aha_* og Music-tabeller

supabase/policies.sql
= eksisterende enkle profilbaserte RLS-policyer

supabase/chamber.sql
= public.aha_insight_chambers + RLS

supabase/embeddings.sql
= public.aha_insight_embeddings + pgvector
```

Frontend leser:

```js
window.AHA_SUPABASE_URL
window.AHA_SUPABASE_PUBLISHABLE_KEY
```

Hvis konfigurasjonen mangler, returnerer `AHADb.isConfigured()` false og appen bruker lokal lagring.

## Dagens lagringsflyt

```text
Notes/Galleri/Feed/Insta/History Go-import
→ localStorage-save
→ AHARepository kan forsøke Supabase-save når modulen er eksplisitt aktivert
→ AHAIngest sender tekstlig materiale til eksisterende AHA-motor
```

Ved dagens innlogging/sync kan enkelte moduler pushe lokale data og lese tilbake remote data. Chamber-sync bruker én JSONB-rad per profil og last-write-wins basert på tidsstempel.

Dette er ikke den endelige fler-enhetskontrakten. Dagens modell mangler blant annet:

- generell IndexedDB-outbox
- per-device cursor
- objektvise revisjoner
- robust konfliktløsing
- eksplisitt førstegangsimport med preview
- arbeidsrom og medlemskap
- objektspecifikk deling og tilbaketrekking

## Canonical PostgreSQL Schema v1

PR 2 i Backend Foundation-roadmapen leverer seks ordnede migrasjoner under `supabase/migrations/`.

Canonical data ligger i separat schema:

```text
aha.*
```

Dette gjør at eksisterende `public.aha_*`-runtime kan fortsette uendret mens den nye modellen installeres og testes i et kontrollert miljø.

### Canonical domener

```text
identity/workspaces
conversations/sources
analysis/evidence
insights/versions/relations/feedback/memory
concept lists/paths/articles/publications
consent/sharing/import/sync/audit/jobs
```

Modellen inneholder 39 tabeller, blant annet:

```text
aha.profiles
aha.devices
aha.workspaces
aha.workspace_memberships
aha.conversations
aha.messages
aha.source_events
aha.analysis_runs
aha.analysis_claims
aha.analysis_evidence
aha.insights
aha.insight_versions
aha.insight_relations
aha.insight_feedback
aha.memory_revisions
aha.concept_lists
aha.knowledge_paths
aha.articles
aha.article_versions
aha.publications
aha.consent_receipts
aha.sharing_grants
aha.import_batches
aha.import_items
aha.device_sync_cursors
aha.audit_events
aha.idempotency_keys
aha.outbox_events
aha.ai_jobs
```

### Viktige schemaegenskaper

- PostgreSQL er system of record bare for eksplisitt synkroniserte konto- og arbeidsromdata.
- `local_only` forblir en device-/importgrense og er ikke en vanlig cloudkolonne.
- `workspace_id` er tenantanker for delte domeneobjekter.
- Sammensatte foreign keys hindrer koblinger på tvers av arbeidsrom der dette kan håndheves i schema.
- Lokale tekst-ID-er kan bevares ved import; nye server-ID-er kan være UUID-as-text.
- Redigerbare objekter har monoton `revision` og tombstones der sync krever det.
- Innsikter og artikler har egne versjonstabeller og deferrable current-version-referanser.
- Sharing grants og offentlig publisering krever samtykkespor.
- Import har batch- og per-item-kvittering med idempotensgrunnlag.
- Outbox og AI-jobs er varige domeneobjekter, ikke bare prosessminne.

## Fail-closed RLS

Schema v1 aktiverer Row Level Security på domenetabellene, men oppretter ingen brukerpolicyer eller frontendgrants.

Dette er med vilje:

```text
PR 2 = datamodell
PR 3 = tenancy-, RLS- og samtykkekontrakt
```

Ingen browserruntime skal få tilgang til `aha.*` før PR 3 og tilhørende cross-tenant-tester er merget. Sensitive writes skal også senere gå gjennom NestJS, ikke gjennom en alternativ direkte databasevei.

## Local-to-canonical mapping

Følgende lokale kilder har mapping i v1:

```text
aha_chat_sessions_v1
aha_source_events_v1
aha_insight_chamber_v1.insights
aha_concept_lists_v1
aha_paths_v1
aha_articles_v1
```

Følgende er eksplisitt deferred eller local-only i denne leveransen:

```text
aha_lists_v1 generelle samlinger
aha_notes_v1
aha_gallery_v1
aha_feed_posts_v1
aha_insta_posts_v1 og sosial graf
AHA Music
Training corpus/examples
Personal AI/workbench state
lokale filer og dataURL-er
```

De blir ikke skjult konvertert til en «nesten lik» canonical tabell. Detaljert mapping og begrunnelse finnes i `AHA_LOCAL_TO_CANONICAL_MAPPING_V1.md`.

## System-of-record-overgang

Målgrensen er:

```text
local-only object
→ blir på enheten

private synced object
→ IndexedDB cache/outbox
→ NestJS command boundary
→ aha.* PostgreSQL system of record

shared workspace object
→ explicit share preview and consent
→ NestJS authorization
→ PostgreSQL workspace scope
```

Innlogging alene er ikke samtykke til å laste opp historiske data.

## Semantisk lagring

Dagens `supabase/embeddings.sql` er første pgvector-implementasjon. ADR-005 låser rekkefølgen:

```text
PgVectorStore først
→ mål latency, recall, filterpresisjon og lekkasje
→ Milvus-adapter bare ved dokumentert behov
```

PostgreSQL forblir system of record selv om en senere Milvus-indeks aktiveres. Vektorlageret er en regenererbar søkeindeks, ikke den eneste kopien av innsikt eller samtykke.

## Aktiveringsport

Canonical schema v1 er ikke ferdig backend. Før runtime kan kobles til det, gjenstår minst:

1. tenancy-, RLS- og samtykkekontrakt
2. installasjonstest mot ren PostgreSQL/Supabase staging
3. migration rehearsal og rollback
4. idempotent førstegangsimport med preview
5. IndexedDB outbox og device cursors
6. import/export-paritet
7. backup og faktisk restore-test
8. NestJS command/API boundary
9. feature flags og rollback til local-first
10. dokumentert null opplasting av local-only/deferred materiale

## Fortsatt ikke implementert eller aktivert

```text
- canonical runtime mot aha.*
- kontoimport
- generell bidireksjonal sync
- tenancy-/RLS-policyene for aha.*
- NestJS command backend
- Hasura proof of value
- LangGraph job orchestration
- Milvus adapter
- Azure staging/production
- ekstern publisering
- EchoNet-deling
- History Go write-back
```
