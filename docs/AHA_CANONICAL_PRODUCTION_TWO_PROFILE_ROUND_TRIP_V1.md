# AHA Canonical Production Two-Profile Round-Trip v1

Status: **IMPLEMENTERT SOM EKSPLISITT VERIFIKASJONSPORT. LIVE EVIDENCE: 1 AV 2 PROFILER BESTÅTT. DEN ANDRE PILOT-SLOTTEN GJENSTÅR. PROFIL #3 ER PAUSET.**

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
alle aktive object states har gyldig serverhash og lokalhash
cursor går aldri bakover
pushCursor eller pullCursor går fremover
```

Dette beviser at det faktisk skjedde en lokal endring, at den ble sendt til production, at serverstate kom tilbake gjennom den vanlige read-pathen, og at begge hash-domenene er materialisert etter lokal rebaseline.

## Cursor-/journalbevis

Runneren returnerer canonical cursor-state etter kjøringen. Verifieren sammenligner cursor før og etter og krever:

```text
pushCursor_after >= pushCursor_before
pullCursor_after >= pullCursor_before
og minst én cursor må øke
```

`bootstrapHighWatermark` registreres også i det tekniske evidence-laget. Dette er klientens observerbare binding til production-journalen; ingen separat database-query eller admin-credential trengs for browser-verifikasjonen.

## Hash-konsistens: to separate hash-domener

`serverPayloadHash` og `localPayloadHash` er med vilje to forskjellige bevisdomener og skal **ikke** kreves å være identiske.

- `serverPayloadHash` beskriver serverens materialiserte snapshot/journal-state. Serverrepresentasjonen kan inneholde servereide felt som revision, tidsstempler og andre materialiserte felt.
- `localPayloadHash` beskriver frontendens canonical projection av den lokale AHA-modellen og brukes av klienten til change detection og lokal rebaseline.

En direkte likhetstest mellom de to verdiene blander derfor to ulike representasjoner. Den tidligere verifier-implementasjonen gjorde nettopp dette og kunne gi falsk feil selv når push, bootstrap/pull og apply var vellykket.

Etter runnerens apply/rebaseline leser verifieren sync-store object state og krever for alle **aktive** states:

```text
serverPayloadHash finnes og er gyldig SHA-256 hex
localPayloadHash finnes og er gyldig SHA-256 hex
```

Verifieren kan fortsatt telle hvor mange server-/lokalhash-par som tilfeldigvis er like eller ulike, men dette er bare diagnostikk og inngår ikke som equality-invariant i closeout-porten.

Verifieren lager i tillegg ett SHA-256 batch-digest over den normaliserte object-state-evidencen. Dette gjør at første run og replay kan sammenlignes uten å vise rå AHA-payload eller objektidentifikatorer i output.

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
aktive server-/lokalhash-domener er komplette og gyldige
cursor går aldri bakover
batch digest er stabilt
```

Dette er den endelige hash-/idempotensprøven: den synkroniserte tilstanden skal ikke generere nye writes eller falske lokale endringer, og begge lagrede hash-domener skal være uendret gjennom en identisk replay.

## Privacy/evidence boundary

Operatorflaten kan vise:

- tekniske tellinger;
- cursor-fremdrift som tall;
- kompletthet/gyldighet for server- og lokalhash-domener;
- diagnostisk telling av ulike server-/lokalhash-par;
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

### Live evidence 2026-08-19

Canonical operatørevidence ligger i:

```text
ops/evidence/canonical-sync-production-two-profile-roundtrip-v1.json
```

Status er nå:

```text
pilot_slot_1 = VERIFIED
first round-trip = PASS
idempotent replay = PASS
pilot_slot_2 = PENDING
verifiedProfileSlots = 1 / 2
closeoutComplete = false
```

`pilot_slot_1`-beviset ble kjørt med verifier build `hash-domains-v2` og viste:

```text
localChanged = 6
enqueued = 6
pushed = 6
bootstrapApplied = 38
pullApplied = 0
conflicts = 0
rejected = 0
cursorAdvanced = true
hashDomainsComplete = true
activeHashPairs = 38 / 38
missingActiveHashValues = 0
invalidHashValues = 0
```

Identisk replay viste:

```text
localChanged = 0
enqueued = 0
pushed = 0
conflicts = 0
hashDomainsComplete = true
hashDigestStable = true
```

Ingen profilidentitet, workspace-ID, access token, rå canonical payload, rå samtaletekst eller objekt-ID-er er lagret i evidence-filen.

## Profil #3

`ops/canonical-sync-production-rollout-v1.json` låser fortsatt:

```text
currentVerifiedProfileCount = 2
nextExpansionPaused = true
nextExpansionRequiresTwoProfileRoundTripEvidence = true
```

Profil #3 skal ikke gå gjennom expansion gate eller activation før `pilot_slot_2` også har både første round-trip og identisk replay som PASS, og to-profil-evidencen er fullført og reviewet.

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
