# AHA Canonical Production Pilot — current status

Status: **AKTIV bounded manual production-pilot i Azure med nøyaktig 2 verifiserte profiler, eksplisitt manuell sync og null automatic/login/background sync. To-profil round-trip closeout er 1 av 2 bestått.**

Dette dokumentet er den operative statuskilden for canonical production-piloten. Eldre arkitektur-/rolloutdokumenter kan beskrive pre-deploy-, pre-activation- eller én-profil-tilstanden; der slike statuslinjer avviker, gjelder denne filen for faktisk operasjonell status.

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
→ two-profile round-trip pilot_slot_1 PASS + idempotent replay PASS
```

Production bruker Azure Container Apps og dedikert privat PostgreSQL 16. Staging/legacy-databaser brukes ikke som production-database.

## Dagens live pilotgrense

Production-allowlisten inneholder nå **nøyaktig 2 profiler**. Begge er eksplisitt aktivert; ingen profil legges til automatisk.

Den siste post-activation-verifikasjonen beviste for profil #2:

```text
live API revision = immutable activation revision
protected allowlist count = 2
eget private workspace bootstrap = HTTP 200
annen pilotprofils private workspace = HTTP 403
per-profile rollback kan beregnes uten mutation
canonical data slettes ikke ved rollback
```

Profil-ID-er, workspace-ID-er og access tokens skrives ikke til operatørevidence.

`ops/canonical-sync-production-rollout-v1.json` er nå autoritativ policy for den aktive bounded-piloten:

```text
status = active_bounded_manual_pilot
productionActivationEnabled = true
activation.enabled = true
currentVerifiedProfileCount = 2
maxProfiles = 10
profilesAddedPerActivation = 1
nextExpansionPaused = true
```

**Profil #3 er eksplisitt pauset** til to-profil round-trip med ekte AHA-data er bevist for begge eksisterende profiler.

## Round-trip closeout-status

Den eksplisitte to-profil-porten har nå live evidence for én av de to ikke-identifiserende pilot-slottene:

```text
pilot_slot_1 = VERIFIED
first round-trip = PASS
idempotent replay = PASS
pilot_slot_2 = PENDING
verifiedProfileSlots = 1 / 2
closeoutComplete = false
profil #3 = IKKE GODKJENT
```

Evidence er lagret i `ops/evidence/canonical-sync-production-two-profile-roundtrip-v1.json` uten profil-ID, workspace-ID, access token, rå canonical payload, rå samtaletekst eller objekt-ID-er.

`pilot_slot_1` brukte verifier build `hash-domains-v2`. Første run hadde 6 lokale endringer, 6 enqueued, 6 pushes, 38 bootstrap-applies, 0 konflikter og 0 rejected. Alle 38 aktive object states hadde komplette gyldige server-/lokalhash-domener. Identisk replay ga 0 lokale endringer, 0 enqueued, 0 pushes, 0 konflikter og stabilt batch-digest.

## Første profil: browser roundtrip og idempotens

Første vellykkede production browser-sync sendte canonical endringer til production, anvendte serverstate tilbake lokalt og hadde `0` konflikter.

En identisk ny kjøring ga:

```text
localPrepared: 1
localChanged: 0
enqueued: 0
pushed: 0
bootstrapApplied: 0
pullApplied: 0
conflicts: 0
```

Dette er eksisterende idempotensbevis for første pilotprofil: samme state skaper ikke nye writes, duplikater eller konflikter.

Ved første Home-hydration på en klientkontekst kan `localPrepared: 0` rapporteres samtidig som `bootstrapApplied: 1`. Dette er forventet av runnerrekkefølgen: `localPrepared` telles før bootstrap, mens serverobjektet anvendes senere i samme eksplisitte kjøring.

## AHA Home

Den separate operatorflaten er fortsatt tilgjengelig som diagnostisk/operativ pilotflate, men normal pilotbruk er integrert i AHA Home.

Home bruker et fast konfigurert production-endpoint. Brukeren skal ikke skrive inn API-origin for vanlig pilotbruk.

Home-grensen er fortsatt:

- ingen auth-/storage-/network-sync ved page load;
- `Synkroniser nå` må velges eksplisitt;
- eget samtykke og `Bekreft og synkroniser` kreves for hver kjøring;
- canonical controller/dependencies lazy-loades først etter bekreftelsen;
- workspace utledes fra innlogget Supabase-subject og kan ikke velges manuelt;
- ingen automatisk retry;
- ingen automatic/login/auth-ready/background sync.

Den separate `canonical-sync-production-pilot.html` beholdes som beskyttet operatorflate for diagnostikk og kontrollert verifikasjon, ikke som normal produktflyt.

## Sikkerhetsgrense som fortsatt gjelder

Production-piloten er **ikke** en generell production-lansering.

Følgende er fortsatt eksplisitt av:

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

Emergency rollback er database-first: runtime-login og aktive sessions kuttes før API-sync slås av. Per-profile rollback fjerner én utvidet profil fra API-allowlisten uten å slette canonical data eller slå av de andre pilotprofilene.

## Midlertidig candidate-token

`AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN` ble bare brukt for den read-only post-activation-verifikasjonen av profil #2. Runtime, Home-sync og den permanente allowlist-modellen er ikke avhengig av dette tokenet.

Etter vellykket post-activation closeout skal denne midlertidige secreten fjernes fra alle GitHub environments der den ble lagt inn. Repoet skal aldri inneholde tokenverdien.

## Neste obligatoriske gate: fullfør ekte to-profil round-trip

Før profil #3 kan vurderes skal **begge** de to eksisterende production-profilene gjennomføre en kontrollert round-trip med reelle, små AHA-datasett. `pilot_slot_1` er nå ferdig; `pilot_slot_2` gjenstår.

```text
lokal AHA-endring
→ canonical adapter
→ IndexedDB outbox
→ POST /v1/sync/push
→ production PostgreSQL/journal
→ bootstrap eller pull
→ lokal apply
→ identisk replay
```

For hver profil skal evidence minst bevise:

- minst én kontrollert lokal canonical endring ble faktisk pushet;
- serverstate kom tilbake via bootstrap eller pull og ble anvendt lokalt;
- cursor/journalposisjon gikk fremover og aldri bakover;
- aktive server-/lokalhash-domener er komplette og gyldige etter apply/rebaseline;
- ingen uventede konflikter eller rejected writes;
- identisk replay gir `changed = 0`, `enqueued = 0` og `pushed = 0`;
- batch-digest er stabilt gjennom replay;
- evidence inneholder ikke profil-ID, workspace-ID, access token eller rå AHA-payload.

Før `pilot_slot_2` også har slikt evidence forblir:

```text
nextExpansionPaused = true
profil #3 = IKKE GODKJENT
```

## Veien videre etter round-trip closeout

Når begge profiler har bestått round-trip og en stabilitetsperiode ikke viser auth-/permission-/conflict-/latency-problemer, kan piloten utvides kontrollert til 3–5 profiler og senere opptil policygrensen på 10.

Hver ny profil går fortsatt gjennom:

```text
candidate
→ read-only expansion gate
→ explicit activation
→ own workspace 200
→ cross-profile private workspace 403
→ rollback dry-run
→ approval
```

Generell production-sync og eventuell automatisk/bakgrunnssynk er separate senere beslutninger og følger ikke automatisk av at bounded-piloten er grønn.
