# AHA Canonical Production Pilot – Post-activation verification v1

Status: **KJØRT OG BESTÅTT for production-profil #2. Porten forblir implementert for senere eksplisitte pilotutvidelser.**

Denne porten brukes etter at én utvidet pilotprofil faktisk er aktivert gjennom candidate-bound expansion gate + same-SHA activation. Den er read-only og gjør ingen canonical production-mutasjon.

## Verifisert profil #2

Den første reelle post-activation-kjøringen for den utvidede production-profilen fullførte med `success` og beviste:

```text
live API revision = kandidatens immutable activation revision
protected allowlist count = 2
candidate own private workspace bootstrap = HTTP 200
candidate → legacy pilot private workspace = HTTP 403
per-profile rollback calculation = READY_REMOVE_ONE_PROFILE_NO_MUTATION
production mutation performed = false
canonical data deleted = false
```

Dette er production-beviset på at den andre piloten både er aktiv gjennom den faktiske API-/databasekjeden og isolert fra den første pilotens private workspace.

## Workflow

```text
.github/workflows/aha-canonical-sync-production-pilot-post-activation-verification.yml
```

Manuell bekreftelse:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_POST_ACTIVATION_VERIFY
```

## Protected values

Kandidatens identitet kommer fra:

```text
AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID
```

For den faktiske access-verifikasjonen brukes et kortlivet eller eksplisitt forvaltet candidate access token:

```text
AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN
```

Tokenet er bare et verifikasjonscredential. Det er **ikke** en runtime-avhengighet for production API, AHA Home-sync eller den permanente allowlisten.

Etter at post-activation closeout er bestått skal `AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN` fjernes fra alle GitHub environments der det ble lagt inn. Tokenverdien skal aldri ligge i repo eller evidence.

## Port 1 – bind til faktisk activation

Workflowen aksepterer bare vellykket expansion-activation evidence for den samme beskyttede kandidaten og krever blant annet:

```text
version = aha_canonical_production_pilot_expansion_activation_v1
status = pass
candidate fingerprint = dagens protected kandidat
activationGitSha = activation-runens faktiske head SHA
newAllowedProfileCount = 2..10
profileAddedOneAtATime = true
runtimeCredentialRotated = false
automatic/login/background sync = false
```

Evidence fra kandidat A kan dermed ikke gjenbrukes for kandidat B.

## Port 2 – live immutable revision og protected allowlist

Workflowen leser dagens Container App og krever:

- canonical sync er aktiv bare innen bounded pilot;
- runtime er aktiv;
- `AHA_API_VERSION` er identisk med activation-SHA;
- live image er `aha-canonical-api:<activation SHA>`;
- JSON-allowlisten bruker en versjonspinnet Key Vault-URI;
- allowlisten inneholder legacy anchor og kandidaten;
- allowlist-antallet er identisk med activation evidence;
- listen har unike profiler og er innenfor 2–10;
- public health rapporterer samme revision og samme `allowedProfileCount`;
- database er connected, canonical schema finnes og runtime-rollen er safe.

Ingen profil-ID skrives til evidence.

## Port 3 – ekte kandidat, ende til ende

Med kandidatens protected access token utføres to read-only kall mot production API.

### Eget workspace

```text
GET /v1/sync/bootstrap
workspaceId = personal-<candidate>
limit = 1
```

Krav:

```text
HTTP 200
data.workspaceId = kandidatens private workspace
meta.apiVersion = activation SHA
```

Dette beviser den virkelige kjeden:

```text
JWT
→ server-side protected allowlist
→ NestJS auth
→ runtime PostgreSQL role
→ request.jwt.claims
→ current_profile_id()
→ workspace-tenancy
→ bootstrap_sync_snapshot_v1()
```

### Annen profil sitt workspace

Samme token brukes mot legacy-pilotens private workspace. Kravet er:

```text
HTTP 403
```

Dette er den negative production-isolasjonstesten.

## Port 4 – rollback dry-run

Etter vellykket tilgangsverifikasjon beregnes rollback kun i minnet:

```text
current protected allowlist
→ fjern kandidaten
→ behold legacy anchor
→ nytt antall = gammelt antall - 1
```

Workflowen skriver ikke ny Key Vault-secret, deployer ikke API, kjører ikke DB-control mutation og sletter ikke canonical data.

## Evidence

En vellykket kjøring produserer et non-identifying artifact:

```text
pilot-post-activation-verification.json
```

Evidence inneholder tekniske bindings- og resultatfelter, men ikke kandidatens UUID, private workspace-ID eller access token.

## Dagens neste gate

Post-activation-verifikasjonen er nå **lukket for profil #2**, men dette er ikke det samme som å ha bevist normal brukerdataflyt for begge pilotene.

Før profil #3 kan vurderes skal begge eksisterende profiler bestå den separate real-data round-trip-porten dokumentert i:

```text
docs/AHA_CANONICAL_PRODUCTION_TWO_PROFILE_ROUND_TRIP_V1.md
canonical-sync-production-roundtrip.html
```

Den porten krever ekte lokal AHA-endring, push, server round-trip/local apply, cursor/hash-konsistens og identisk idempotens-replay.
