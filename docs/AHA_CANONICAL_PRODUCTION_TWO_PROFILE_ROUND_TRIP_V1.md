# AHA Canonical Production Two-Profile Round-Trip v1

Status: **IMPLEMENTERT SOM EKSPLISITT VERIFIKASJONSPORT. LIVE EVIDENCE MANGLER FORTSATT FOR BEGGE PROFILER. PROFIL #3 ER PAUSET.**

## Formål

Production-piloten har to isolerte og verifiserte brukerprofiler, men post-activation-verifikasjonen av profil #2 var med vilje read-only. Den siste store dataintegritetsprøven er derfor normal synkronisering av ekte AHA-data for begge eksisterende profiler.

Denne porten skal bevise den faktiske produktkjeden:

```text
lokal AHA-endring
→ canonical frontend adapter
→ IndexedDB outbox
→ POST /v1/sync/push
→ production PostgreSQL + sync journal
→ bootstrap eller pull
→ canonical local apply
→ lokal hash-rebaseline
→ identisk replay
```

Ingen ny backendprotokoll introduseres. Verifikasjonen gjenbruker de samme komponentene som AHA Home sin manuelle production-sync.

## Operatorflate

```text
canonical-sync-production-roundtrip.html
```

URL-port:

```text
?ahaCanonicalProductionRoundTrip=1
```

Bekreftelsesfrase:

```text
RUN_AHA_CANONICAL_TWO_PROFILE_ROUND_TRIP
```

Implementasjon:

```text
js/ahaCanonicalProductionRoundTripVerifier.js
```

Production API-origin kommer fra `AHACanonicalProductionHomeSync.PRODUCTION_API_ORIGIN`. Operatoren kan ikke skrive inn et alternativt endpoint. Privat workspace utledes fra den innloggede Supabase-identiteten via den eksisterende production pilot identity bridge.

## Side-effect boundary

Bare det å laste siden eller verifier-modulen skal ikke:

```text
lese auth
lese/skrive localStorage
lese/skrive IndexedDB
kjøre fetch
starte sync
starte retry
aktivere profil
endre allowlist
```

Kjøringen starter først etter URL-gate, eksakt bekreftelsesfrase og eksplisitt samtykke.

## Forbered kontrollert datasett

Verifikasjonen skal kjøres separat for hver av de to allerede allowlistede profilene.

For hver profil:

1. logg inn som riktig AHA-bruker;
2. lag én liten og entydig lokal endring i en AHA-modell som allerede inngår i canonical adapteren;
3. ikke bytt profil eller nettleserkontekst mellom endringen og første run;
4. åpne den beskyttede round-trip-siden med URL-porten;
5. bekreft at dette er en kontrollert production-mutasjon;
6. kjør første round-trip;
7. dersom den består: **ikke endre lokale data**;
8. kjør identisk replay.

Testdata skal ikke erstatte den ordinære lokale AHA-modellen; hensikten er å bevise den virkelige produktdataflyten.

## Første run: krav

Verifieren samler teknisk evidence fra eksisterende `AHACanonicalManualSyncRunner` og `AHACanonicalSyncStore`.

Første run er bare grønn når:

```text
pushed > 0
bootstrapApplied + pullApplied > 0
pushConflicts = 0
pushRejected = 0
conflictCount = 0
hash mismatches = 0
cursor går aldri bakover
pushCursor eller pullCursor går fremover
```

Dette beviser at det faktisk skjedde en lokal endring, at den ble sendt til production, at serverstate kom tilbake gjennom den vanlige read-pathen, og at den lokale canonical tilstanden ble rebaselinet mot samme payload-hashes.

## Cursor-/journalbevis

Runneren returnerer canonical cursor-state etter kjøringen. Verifieren sammenligner cursor før og etter og krever:

```text
pushCursor_after >= pushCursor_before
pullCursor_after >= pullCursor_before
og minst én cursor må øke
```

`bootstrapHighWatermark` registreres også i det tekniske evidence-laget. Dette er klientens observerbare binding til production-journalen; ingen separat database-query eller admin-credential trengs for browser-verifikasjonen.

## Hash-konsistens

Etter runnerens apply/rebaseline leser verifieren sync-store object state og teller:

```text
states
server+local hash comparable
matches
mismatches
server-only
local-only
deleted
```

Kravet for closeout er `mismatches = 0`.

Verifieren lager i tillegg ett SHA-256 batch-digest for å kunne sammenligne første run med replay uten å vise rå AHA-payload. Evidence returnerer ikke objekt-ID-er, profil-ID, workspace-ID eller access token.

## Identisk replay: idempotens

Etter en grønn første run skal operatoren kjøre samme profil igjen uten noen lokal endring.

Replay er bare grønn når:

```text
localChanged = 0
enqueued = 0
pushed = 0
pushConflicts = 0
pushRejected = 0
conflictCount = 0
hash mismatches = 0
cursor går aldri bakover
batch digest er stabilt
```

Dette er closeout-beviset på at den synkroniserte tilstanden ikke genererer duplikate writes eller falske lokale endringer ved neste eksplisitte sync.

## Privacy/evidence boundary

Operatorflaten kan vise:

- tekniske tellinger;
- cursor-fremdrift som tall;
- hash-match/mismatch counts;
- opaque SHA-256 batch digest;
- PASS/IKKE BESTÅTT.

Den skal ikke vise eller returnere:

```text
Supabase subject / profil-ID
workspace-ID
access token
rå canonical payload
serverState
rå AHA-samtaletekst
objekt-ID-er
```

## To separate profilbevis

Porten er ikke lukket etter én bruker.

Begge eksisterende production-profiler må hver ha:

```text
first round-trip = PASS
idempotent replay = PASS
```

Evidence skal registreres operativt med tidspunkt/run-kontekst og hvilken av de to **ikke-identifiserende pilot-slottene** som ble testet, uten å publisere den faktiske profilidentiteten.

## Profil #3

`ops/canonical-sync-production-rollout-v1.json` låser nå:

```text
currentVerifiedProfileCount = 2
nextExpansionPaused = true
nextExpansionRequiresTwoProfileRoundTripEvidence = true
```

Profil #3 skal ikke gå gjennom expansion gate eller activation før begge profilbevisene over er fullført og reviewet.

## Etter closeout

Når begge profiler er grønne, er neste fase stabilitet med de samme to brukerne. Følg minst:

```text
auth_rejections
permission_rejections
sync_conflicts
sync_push_results
request_latency
database_connections
database_query_load
```

Først etter stabil bruk bør bounded-piloten utvides til 3–5 profiler og senere eventuelt opptil policygrensen på 10. General production-sync og automatic/background sync er fortsatt separate senere beslutninger.
