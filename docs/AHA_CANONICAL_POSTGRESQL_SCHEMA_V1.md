# AHA Canonical PostgreSQL Schema v1

Status: **schema- og migreringskontrakt — ikke aktiv runtime**  
Dato: 14. august 2026

Dette dokumentet beskriver den første normaliserte PostgreSQL-modellen for synkroniserte AHA- og EchoNet-data. Modellen følger `ADR-001` til `ADR-006` og er neste leveranse etter `AHA_BACKEND_FOUNDATION_ROADMAP_V1.md`.

Schemaet aktiverer ikke kontoimport, synkronisering, EchoNet-deling, Hasura, NestJS, LangGraph, Milvus eller Azure. Dagens `localStorage`-runtime og eksisterende `public.aha_*`-tabeller forblir urørt.

## 1. Fysisk avgrensning

Canonical v1 ligger i et eget PostgreSQL-schema:

```text
aha.*
```

Eksisterende MVP-tabeller ligger fortsatt i:

```text
public.aha_*
public.music_*
```

De seks ordnede migrasjonene oppretter nye tabeller, indekser, revisjonstriggere og en fail-closed RLS-baseline. De gjør ingen destruktive endringer i `public`-schemaet.

```text
supabase/migrations/20260814215000_aha_identity_workspaces_v1.sql
supabase/migrations/20260814215100_aha_conversations_sources_v1.sql
supabase/migrations/20260814215200_aha_analysis_insights_v1.sql
supabase/migrations/20260814215300_aha_artifacts_v1.sql
supabase/migrations/20260814215400_aha_governance_v1.sql
supabase/migrations/20260814215500_aha_schema_guards_v1.sql
```

Migrasjonene skal kjøres i denne rekkefølgen. Hver fil er separat transaksjon og skal kunne brukes i en kontrollert utviklings- eller stagingdatabase. Produksjonsaktivering krever senere migrerings-, RLS- og restore-porter.

## 2. System-of-record-grense

PostgreSQL er system of record bare for data som brukeren uttrykkelig har valgt å knytte til en konto eller et arbeidsrom.

```text
local-only objekt
→ forblir på enheten

privat synkronisert objekt
→ IndexedDB cache/outbox
→ NestJS command boundary
→ aha.* i PostgreSQL

arbeidsromdelt objekt
→ separat delingshandling og samtykke
→ NestJS authorization
→ workspace-scope i PostgreSQL
```

Innlogging alene er ikke import- eller opplastingssamtykke.

## 3. Identitet og tenantmodell

Canonical data er forankret i:

```text
profiles
→ devices
→ workspaces
→ workspace_memberships
→ domain objects
```

Private kontoobjekter skal ligge i et personlig arbeidsrom. Gruppe-, organisasjons- og forskningsdata ligger i egne arbeidsrom med eksplisitte medlemskap og roller.

Første systemroller er:

- `owner`
- `editor`
- `member`
- `observer`

Alle delte domeneobjekter har `workspace_id`. Sammensatte foreign keys brukes der det er nødvendig for å hindre at en rad kobler sammen objekter fra ulike arbeidsrom.

## 4. ID-strategi

Canonical primærnøkler er i hovedsak `text`.

Dette er bevisst:

- eksisterende lokale ID-er kan bevares ved import
- nye serverobjekter kan bruke UUID representert som tekst
- import trenger ikke skrive om alle referanser
- idempotens kan baseres på stabile lokale eller eksterne ID-er

En tekst-ID er ikke tillit i seg selv. Eierskap og tilgang bestemmes av tenant, medlemskap, samtykke og servervalidering.

## 5. Canonical domener

### Identity og arbeidsrom

| Tabell | Rolle |
|---|---|
| `aha.profiles` | Kontoidentitet koblet til auth-provider og subject. |
| `aha.devices` | Registrerte enheter og sync-identitet. |
| `aha.workspace_roles` | Versjonert systemrollegrunnlag. |
| `aha.workspaces` | Personlige, gruppe-, organisasjons- og forskningsarbeidsrom. |
| `aha.workspace_memberships` | Rolle og status per bruker og arbeidsrom. |
| `aha.workspace_invitations` | Hash-baserte invitasjoner med utløp og auditfelt. |

### Samtaler og kilder

| Tabell | Rolle |
|---|---|
| `aha.conversations` | Canonical samtale- eller refleksjonscontainer. |
| `aha.conversation_participants` | Deltakelse uten å blande det med arbeidsrommedlemskap. |
| `aha.messages` | Append-orienterte chatmeldinger med stabil lokal ID. |
| `aha.source_events` | Rå kildelogg og provenance før analyse. |
| `aha.source_attachments` | Metadata og storage-referanser, ikke rå filer i databasen. |

### Analyse og innsikt

| Tabell | Rolle |
|---|---|
| `aha.analysis_runs` | Versjonert kjøring bundet til source hash, motor og workflow. |
| `aha.analysis_claims` | Påstander og tolkninger fra analysen. |
| `aha.analysis_evidence` | Direkte kildebelegg og posisjon der det finnes. |
| `aha.insights` | Stabil insight-identitet og aktiv status. |
| `aha.insight_versions` | Historiske og nye formuleringer uten stille overskriving. |
| `aha.insight_relations` | Navngitte forbindelser mellom innsikter. |
| `aha.insight_feedback` | Brukerens kvalitetsvurdering med kilde-/analyseidentitet. |
| `aha.memory_revisions` | Korrigering, konflikt, erstatning og reaktivering. |

`aha_insight_chamber_v1`-bloben blir ikke canonical målmodell. Innsikter normaliseres til identitet, versjon, relasjon, feedback og minnelivssyklus.

### Artefakter og publisering

| Tabell | Rolle |
|---|---|
| `aha.concept_lists` / `aha.concept_list_items` | Begrepslister og presise begrepsposter. |
| `aha.knowledge_paths` / `aha.knowledge_path_steps` | Adaptive lærings-, skrive-, undersøkelses- og arbeidsstier. |
| `aha.articles` / `aha.article_versions` | AHAavisa-utkast og versjoner. |
| `aha.article_references` | Sporbare referanser til eksisterende AHA-objekter. |
| `aha.publications` | Publiseringskandidat, godkjenning, resultat og tilbakekalling. |

`published_local` beholdes som lokal workflowstatus. Offentlig publisering krever en egen `publications`-rad og et gyldig samtykkespor.

### Styring, sync og jobbkontroll

| Tabell | Rolle |
|---|---|
| `aha.consent_receipts` | Eksplisitt, versjonert samtykke og tilbaketrekking. |
| `aha.sharing_grants` | Objektdeling fra ett arbeidsrom til et annet. |
| `aha.import_batches` / `aha.import_items` | Idempotent og etterprøvbar førstegangsimport. |
| `aha.device_sync_cursors` | Per-device synccursor og siste observerte serverrevision. |
| `aha.data_exports` | Eksportforespørsel og resultat. |
| `aha.deletion_requests` | Sletting og status på gjennomføringen. |
| `aha.audit_events` | Append-only domene- og sikkerhetshistorikk. |
| `aha.idempotency_keys` | Nøyaktig-én-gang-effekt for retrybare kommandoer. |
| `aha.outbox_events` | Transaksjonell utsending av domenehendelser. |
| `aha.ai_jobs` | Gjenopptakbare analyse-, embedding- og publiseringsjobber. |
| `aha.schema_versions` | Kvittering for installert schema uten runtimeaktivering. |

## 6. Revisjon, tombstones og provenance

Redigerbare objekter har monoton `revision`, `updated_at` og ved behov `deleted_at`.

- `deleted_at` er sync-tombstone, ikke automatisk hard delete.
- Meldinger, source events, audit og versjonsrader behandles append-orientert.
- Innsikts- og artikkelinnhold ligger i versjonstabeller.
- `current_version` er bundet med deferrable foreign key, slik at identitet og første versjon kan opprettes atomisk.
- Kildeidentitet, source hash og provenance bevares gjennom analyse og innsikt.
- Semantisk likhet alene oppretter aldri en revisjon eller deler et objekt.

## 7. Samtykke og deling

Canonical schema skiller mellom:

- privat data i brukerens arbeidsrom
- data delt til ett navngitt arbeidsrom
- offentlig kandidat
- faktisk publisering
- forskningskandidat

`aha.sharing_grants` krever en eksplisitt `consent_receipt_id`. Offentlig publisering krever også samtykkespor. Senere policykode skal kontrollere at receipt, bruker, workspace, formål, scope og status passer til handlingen; schemaet alene er ikke hele autorisasjonen.

Privacy settings fra nettleseren er ikke automatisk samtykkekvittering. Nytt server-side samtykke må opprettes gjennom en eksplisitt handling.

## 8. Fail-closed RLS-baseline

Alle domenetabeller får Row Level Security aktivert, men denne leveransen oppretter ingen brukerpolicyer eller frontendgrants.

Det er bevisst fail-closed:

- PR 2 definerer dataformen.
- PR 3 skal definere tenancy-, RLS- og samtykkematrisen.
- Ingen browserklient skal bruke `aha.*` før policyene og testene er merget.
- NestJS skal eie sensitive writes selv etter at RLS finnes.

RLS-tabeller uten policies er ikke en ferdig produksjonsmodell, men de hindrer at en senere tilfeldig grant åpner data som standard.

## 9. Legacy- og defermentgrense

Denne første canonical kjernen dekker data som trengs for AHA → EchoNet-overgangen:

- Chat
- source events
- analyse og belegg
- insights og minnelivssyklus
- begrepslister
- stier
- AHAavisa
- samtykke, deling, import, sync, audit og jobs

Følgende runtimeflater forblir i dagens legacy-modell til egne migreringskontrakter er godkjent:

- Notes
- Galleri og filobjekter
- Feed
- AHA Insta og sosial graf
- AHA Music
- generelle `aha_lists_v1`-samlinger
- Training corpus og Personal AI-arbeidsdata

De skal ikke massekonverteres til nærliggende canonical tabeller bare fordi feltene ligner. `AHA_LOCAL_TO_CANONICAL_MAPPING_V1.md` er autoritativ mapping for denne leveransen.

## 10. Aktiveringsport

Schemaet er levert, men ikke produksjonsaktivt. Neste port er:

```text
PR 3 — tenancy-, RLS- og samtykkekontrakt
```

Før runtime kan bruke `aha.*`, må prosjektet minst ha:

1. installasjonstest i ren PostgreSQL/Supabase staging
2. rollback- og migration rehearsal
3. RLS-matrise for eier, medlem, redaktør og uvedkommende
4. idempotent lokal import med preview og kvittering
5. import/export-paritet på fixtures
6. IndexedDB outbox og device cursors
7. faktisk backup- og restore-test
8. dataklassifisering og samtykkeflyt
9. ingen upload av local-only-data
10. feature flag og rollback til dagens local-first-runtime

## 11. Forholdet til prosjektvisjonen

Schemaet er laget for å muliggjøre prosjektets tre nivåer uten å blande dem:

```text
personlig AHA
→ eksplisitt arbeidsromdeling
→ mulig kollektiv EchoNet-verdi
→ separat offentlig eller forskningsmessig godkjenning
```

Teknologien skal støtte overgangen fra individuell refleksjon til gruppe- og kollektiv kunnskap, men databasen skal aldri gjøre denne overgangen automatisk.
