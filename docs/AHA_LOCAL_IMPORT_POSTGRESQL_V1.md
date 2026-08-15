# AHA Local Account Import → PostgreSQL v1

Status: **implementert kontrakt bak eksplisitte feature flags — ikke automatisk aktivert frontendflyt**

Denne leveransen etablerer den første kontrollerte overgangen fra eksisterende local-first AHA-data til canonical `aha.*` PostgreSQL uten å gjøre innlogging til opplastingssamtykke.

## Hovedregel

```text
Lokal AHA-data
→ normaliseres på enheten
→ preview vises lokalt
→ bare hash + tellinger sendes til confirmation-endepunktet
→ brukeren må eksplisitt bekrefte den viste planen
→ først da sendes den allow-listede canonical planen
→ NestJS verifiserer hash, bruker, tellinger og confirmation-token
→ én idempotent PostgreSQL-kommando skriver data + kvitteringer
```

**Previewet lastes ikke opp.** Confirmation-kallet inneholder ingen meldinger, innsikter, artikler eller annet råinnhold.

## 1. Tillatte lokale kilder

Første importversjon kan bare lese disse eksisterende AHA-nøklene:

```text
aha_chat_sessions_v1
aha_source_events_v1
aha_insight_chamber_v1
aha_concept_lists_v1
aha_paths_v1
aha_articles_v1
```

De blir normalisert til:

```text
conversations
messages
source_events
insights + insight_versions
concept_lists + concept_list_items
knowledge_paths + knowledge_path_steps
articles + article_versions + article_references
```

Lokale tekst-ID-er beholdes der det er mulig. Dette gjør retry og senere eksport/restore etterprøvbart.

## 2. Eksplisitt ekskludert

Denne leveransen sender ikke følgende til canonical PostgreSQL:

```text
aha_lists_v1 generelle samlinger
aha_notes_v1
aha_gallery_v1
aha_feed_posts_v1
AHA Insta + stories + sosial graf
aha_groups_v1
AHA Music
Training corpus/examples
Personal AI / workbench state
lokale filer og dataURL-er
andre ikke-allow-listede localStorage-nøkler
```

`AHALocalAccountImport` kan rapportere at en ekskludert nøkkel finnes lokalt, men den leser ikke innholdet inn i importplanen. En confirmation descriptor inneholder bare nøkkel-uavhengige tellinger og SHA-256-hasher.

## 3. On-device preview

`js/ahaLocalAccountImport.js`:

1. leser bare allow-listede nøkler;
2. normaliserer dem til `aha_local_import_plan_v1`;
3. beregner `payloadHash` over det tillatte lokale snapshotet;
4. beregner `planHash` over den canonical planen;
5. teller objektene;
6. markerer hvilke deferred/local-only-nøkler som finnes uten å inkludere innholdet.

Preview-resultatet har eksplisitt:

```text
excludedDataUploaded = false
requiresExplicitConfirmation = true
```

Modulen gjør ingen `fetch`, `XMLHttpRequest`, `sendBeacon` eller WebSocket-kall.

## 4. Confirmation challenge

```http
POST /v1/local-imports/confirmation
```

Kallet kan bare inneholde:

```text
sourceKind
sourceVersion
payloadHash
planHash
counts
```

NestJS lager et kortlivet HMAC-SHA256-token bundet til:

```text
verifisert JWT subject
verifisert auth provider
account_import
personlig workspace-scope
payloadHash
planHash
hash av eksakte tellinger
policyVersion
utløpstid
unik nonce
```

Tokenet er **ikke** samtykke alene. Klienten skal etter dette vise den lokale previewen og kreve en eksplisitt bekreftelseshandling før commit-kallet sendes.

## 5. Explicit commit

```http
POST /v1/local-imports/commit
```

Før dette kallet kan gå videre:

- `AHA_LOCAL_IMPORT_ENABLED=true` må være satt;
- JWT må være gyldig;
- canonical databaseadapter må være aktiv;
- runtime-rollen må være non-owner og uten `BYPASSRLS`;
- `planHash` beregnes på nytt på serveren;
- alle tellinger beregnes på nytt fra planen;
- confirmation-token må matche samme principal, payload, plan og tellinger;
- ukjente root-felter i planen avvises;
- objektgrensen må være innenfor konfigurert maksimum.

Committen går deretter gjennom:

```text
CanonicalDatabaseService.withCommandSession(...)
→ aha.commit_local_import_v1(...)
```

`withCommandSession` setter fortsatt transaksjonslokale verifiserte JWT-claims, `row_security=on`, statement/lock timeout og runtime-sikkerhetskontroll. Forskjellen fra read-session er bare at transaksjonen ikke settes read-only.

## 6. Ingen generelle database-writes

Migrasjonen oppretter **ikke**:

```text
GRANT INSERT/UPDATE/DELETE på canonical tabeller
nye write-RLS-policyer
PUBLIC EXECUTE på importkommandoen
browser-direkte databasevei
```

`aha.commit_local_import_v1(...)` er `SECURITY DEFINER`, har låst `search_path`, og `EXECUTE` trekkes tilbake fra `PUBLIC`.

Et staging-/produksjonsmiljø må senere eksplisitt gi kun denne funksjonen `EXECUTE` til den dedikerte NestJS runtime-rollen. Den rollen skal fortsatt ikke eie tabellene og skal ikke ha `BYPASSRLS`.

## 7. Samtykke i databasen

Commit-funksjonen oppretter en egen `aha.consent_receipts`-rad med:

```text
purpose = account_import
consent_scope = aha.account_import_scope(personal_workspace, source_kind, payload_hash)
policy_version = aha_account_import_v1
evidence.method = explicit_hash_bound_confirmation
```

Import-batchen peker på denne kvitteringen. Dermed er hver førstegangsimport bundet til den konkrete payload-hashen — ikke til en generell privacy-toggle eller bare til innlogging.

## 8. Idempotens og duplikater

Importen bruker både:

- payload-identitet fra eksisterende `import_batches`-unikhet;
- eksplisitt `idempotency_key` per NestJS-kommando;
- stabile lokale objekt-ID-er;
- per-objekt `import_items`-kvitteringer.

Retry med samme payload/idempotency-key returnerer eksisterende batch og skal ikke lage en ny kopi.

Hvis en lokal objekt-ID allerede finnes i samme personlige arbeidsrom, markeres objektet som `duplicate` i importkvitteringen. Hvis samme ID allerede tilhører et annet workspace, avbrytes hele transaksjonen i stedet for å koble data på tvers av tenantgrensen.

## 9. Import receipts

For hvert planobjekt lagres en `aha.import_items`-kvittering med minst:

```text
local_storage_key
local_object_id
object_type
canonical_object_id
status
reason
object_hash
```

Batchen lagrer:

```text
preview_counts
result_counts
payload_hash
plan_hash
idempotency_key
consent_receipt_id
```

Audit-eventet inneholder hash, tellinger og batchidentitet, men ikke samtaletekst eller annen rå lokal data.

## 10. Feature flags

Backend er fail-closed:

```text
AHA_LOCAL_IMPORT_ENABLED=false      # default
AHA_IMPORT_CONFIRMATION_SECRET=...  # min 32 tegn når aktivert
AHA_IMPORT_CONFIRMATION_TTL_SECONDS=600
AHA_LOCAL_IMPORT_MAX_OBJECTS=25000
```

Databaseadapteren har i tillegg sine egne eksisterende opt-in-variabler (`AHA_DATABASE_ENABLED`, sikker TLS-konfigurasjon osv.).

## 11. Hva denne PR-en ikke aktiverer

Denne leveransen kobler ikke automatisk importknappen inn i dagens AHA-UI og slår ikke på cloudimport i produksjon. Den etablerer den testede data-, API-, samtykke- og databasekontrakten som en senere UI-/stagingaktivering kan bruke.

Den aktiverer heller ikke:

```text
bidireksjonal sync
IndexedDB outbox
EchoNet-deling
offentlig publisering
History Go write-back
Hasura write path
LangGraph
Milvus
Azure production
```

## 12. Aktiveringsport

Før virkelig kontoimport slås på må minst dette være grønt:

1. alle root- og NestJS-tester;
2. migrasjon installert i ren stagingdatabase;
3. dedikert runtime-rolle verifisert som non-owner/no-`BYPASSRLS`;
4. kun `EXECUTE` på importkommandoen gitt der det er nødvendig;
5. ekte import-rehearsal med representative lokale data;
6. retry-test med null duplikater;
7. eksport etter import sammenlignet med importplanen;
8. sletting/restore-verifikasjon;
9. UI som viser nøyaktig preview og eksplisitt bekreftelse;
10. dokumentert null opplasting av deferred/local-only-data.

## 13. Tester

Denne leveransen har permanente porter for blant annet:

- allow-list og deny-list;
- null nettverk i lokal preview-builder;
- null local-only-data i confirmation descriptor og commit payload;
- HMAC-binding til principal, payload, plan og tellinger;
- plan-rehash før databasekommando;
- command-session med RLS/runtime-role-sikkerhet;
- exact account-import consent;
- idempotent import-batch;
- per-objekt import receipts;
- null generic write-policy og null PUBLIC execute;
- eksisterende Express-runtime uendret.
