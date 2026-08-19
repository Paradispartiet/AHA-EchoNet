# AHA Canonical Production Pilot — current status

Status: **AKTIV bounded manual production-pilot i Azure med nøyaktig 2 verifiserte profiler, eksplisitt manuell sync og null automatic/login/background sync. To-profil round-trip closeout er FULLFØRT 2 av 2. Neste gate er stabilitetsobservasjon; profil #3 er fortsatt pauset.**

Dette dokumentet er den operative statuskilden for canonical production-piloten. Eldre arkitektur-/rolloutdokumenter kan beskrive pre-deploy-, pre-activation- eller tidligere closeout-tilstand; ved avvik gjelder denne filen.

## Verifisert produksjonskjede

Følgende kjede er gjennomført mot dedikert Azure production:

```text
migration rehearsal
→ Azure production platform deploy
→ ekte backup/PITR restore rehearsal
→ observability readiness
→ read-only production rollout gate
→ eksplisitt pilot activation
→ browser roundtrip + idempotens for første pilotprofil
→ bounded expansion gate
→ same-SHA expansion activation for profil #2
→ post-activation production verification
→ manuell production-sync integrert i AHA Home
→ two-profile round-trip pilot_slot_1 PASS + replay PASS
→ two-profile round-trip pilot_slot_2 PASS + replay PASS
→ two-profile round-trip closeout COMPLETE
```

Production bruker Azure Container Apps og dedikert privat PostgreSQL 16. Staging/legacy-databaser brukes ikke som production-database.

## Dagens live pilotgrense

Production-allowlisten inneholder **nøyaktig 2 profiler**. Begge er eksplisitt aktivert; ingen profil legges til automatisk.

`ops/canonical-sync-production-rollout-v1.json` er autoritativ policy:

```text
status = active_bounded_manual_pilot
productionActivationEnabled = true
activation.enabled = true
currentVerifiedProfileCount = 2
maxProfiles = 10
profilesAddedPerActivation = 1
nextExpansionPaused = true
twoProfileRoundTripEvidenceComplete = true
nextExpansionRequiresStabilityObservation = true
stabilityObservationComplete = false
```

Profil #3 er derfor **ikke godkjent ennå** selv om round-trip-porten nå er ferdig.

## To-profil round-trip closeout

Ikke-identifiserende live evidence ligger i:

```text
ops/evidence/canonical-sync-production-two-profile-roundtrip-v1.json
```

Closeout-status:

```text
pilot_slot_1 = VERIFIED
pilot_slot_2 = VERIFIED
verifiedProfileSlots = 2 / 2
closeoutComplete = true
profil #3 = IKKE GODKJENT
```

### pilot_slot_1

Første run hadde 6 lokale endringer, 6 enqueued, 6 pushes, 38 bootstrap-applies, 0 konflikter og 0 rejected. Alle 38 aktive object states hadde komplette gyldige server-/lokalhash-domener. Identisk replay ga 0 lokale endringer, 0 enqueued, 0 pushes, 0 konflikter og stabilt batch-digest.

### pilot_slot_2

Første run hadde 6 lokale endringer, 6 enqueued, 6 pushes, 7 bootstrap-applies, 0 konflikter og 0 rejected. Alle 7 aktive object states hadde komplette gyldige server-/lokalhash-domener. Identisk replay ga 0 lokale endringer, 0 enqueued, 0 pushes, 0 konflikter og stabilt batch-digest.

Ingen profil-ID, workspace-ID, access token, rå canonical payload, rå samtaletekst eller objekt-ID-er er lagret i round-trip-evidencen.

## Isolasjonsbevis for profil #2

Post-activation-verifikasjonen før round-trip-closeout beviste:

```text
live API revision = immutable activation revision
protected allowlist count = 2
eget private workspace bootstrap = HTTP 200
annen pilotprofils private workspace = HTTP 403
per-profile rollback kan beregnes uten mutation
canonical data slettes ikke ved rollback
```

Dette isolasjonsbeviset er separat fra round-trip-evidencen og er fortsatt gjeldende.

## AHA Home

Normal pilotbruk er integrert i AHA Home. Home bruker fast konfigurert production-endpoint og beholder følgende grense:

- ingen auth-/storage-/network-sync ved page load;
- `Synkroniser nå` må velges eksplisitt;
- eget samtykke og bekreftelse kreves for hver kjøring;
- canonical dependencies lazy-loades først etter bekreftelsen;
- workspace utledes fra innlogget Supabase-subject og kan ikke velges manuelt;
- ingen automatisk retry;
- ingen automatic/login/auth-ready/background sync.

Den separate `canonical-sync-production-pilot.html` og round-trip-flaten beholdes som beskyttede diagnostiske/operatorflater, ikke som normal produktflyt.

## Sikkerhetsgrense som fortsatt gjelder

Production-piloten er **ikke** en generell production-lansering. Følgende er fortsatt eksplisitt av:

```text
automatic sync
login-triggered sync
auth-ready-triggered sync
background sync
local import
automatic profile expansion
group/public canonical sharing
```

API-et håndhever protected server-side allowlist. Workspace utledes fra innlogget subject. PostgreSQL-tenancy er fortsatt den autoritative andre isolasjonsporten.

Emergency rollback er database-first. Per-profile rollback kan fjerne én utvidet profil fra API-allowlisten uten å slette canonical data eller slå av de andre pilotprofilene.

## Midlertidig candidate-token

`AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN` ble bare brukt for den read-only post-activation-verifikasjonen av profil #2. Runtime, Home-sync og den permanente allowlist-modellen er ikke avhengig av dette tokenet.

Etter vellykket post-activation closeout skal denne midlertidige secreten fjernes fra alle GitHub environments der den ble lagt inn. Repoet skal aldri inneholde tokenverdien.

## Neste obligatoriske gate: stabilitet med de samme to profilene

Round-trip closeout er ferdig. Før profil #3 vurderes skal piloten nå observeres med de samme to brukerne uten å endre sikkerhetsgrensene.

Følg minst:

```text
auth_rejections
permission_rejections
sync_conflicts
sync_push_results
request_latency
database_connections
database_query_load
http_errors
```

Stabilitetsperioden skal dokumentere at normal eksplisitt bruk ikke gir nye auth-/permission-feil, uventede sync-konflikter, duplikate writes, vedvarende latency-problemer eller uønsket databasebelastning.

Mens stabilitetsgaten er åpen forblir:

```text
nextExpansionPaused = true
stabilityObservationComplete = false
profil #3 = IKKE GODKJENT
```

Når stabilitet er dokumentert kan en separat reviewed beslutning vurdere profil #3 og kontrollert utvidelse til 3–5 profiler. Hver ny profil skal fortsatt gjennom candidate → read-only expansion gate → eksplisitt activation → own workspace 200 → cross-profile 403 → rollback dry-run → approval.

Generell production-sync og eventuell automatisk/bakgrunnssynk er separate senere beslutninger og følger ikke automatisk av at bounded-piloten er grønn.
