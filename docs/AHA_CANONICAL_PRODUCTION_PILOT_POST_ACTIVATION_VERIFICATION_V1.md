# AHA Canonical Production Pilot – Post-activation verification v1

Status: **implementert i repoet, men ikke kjørt mot en ny production-profil.**

Denne porten brukes først etter at én utvidet pilotprofil faktisk er aktivert gjennom den eksisterende candidate-bound expansion gate + same-SHA activation-flyten. Merge av denne leveransen verifiserer eller aktiverer ingen profil i production.

## Formål

Activation alene beviser at kandidaten ble bootstrappet og lagt til i den beskyttede allowlisten. Post-activation verification skal i tillegg bevise at den virkelige kandidaten faktisk kan bruke den eksakte aktive API-revisjonen, at kandidatens private workspace fungerer, og at kandidaten fortsatt ikke kan lese legacy-pilotens private workspace.

Porten er **read-only**. Den gjør ingen production-mutasjon.

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-post-activation-verification.yml
```

Manuell bekreftelse:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_POST_ACTIVATION_VERIFY
```

## Protected values

Kandidatens identitet kommer fortsatt fra:

```text
AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID
```

I tillegg kreves et kortlivet eller eksplisitt forvaltet **candidate access token** for den faktiske aktiverte kandidaten:

```text
AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN
```

Tokenet skal være kandidatens virkelige production access-token. Det lagres som protected environment secret, maskeres før bruk og skrives aldri til evidence.

Tokenet skal ikke settes før en konkret profil #2 faktisk er valgt og aktivert.

## Port 1 – bind til faktisk activation

Workflowen leter bare etter vellykket expansion-activation evidence for den samme beskyttede kandidaten.

Den krever:

```text
version = aha_canonical_production_pilot_expansion_activation_v1
status = pass
candidate fingerprint = dagens protected kandidat
activationGitSha = GitHub Actions-runens faktiske head SHA
newAllowedProfileCount = 2..10
profileAddedOneAtATime = true
runtimeCredentialRotated = false
automatic/login/background sync = false
```

Dermed kan evidence fra kandidat A ikke brukes for kandidat B.

Post-verification-workflowens egen Git-SHA kan være nyere enn activation-SHA-en. Det som er autoritativt er at den live API-revisjonen fortsatt er nøyaktig activation-SHA-en som evidence beskriver.

## Port 2 – live immutable revision og protected allowlist

Workflowen leser dagens Container App og krever:

- canonical sync er fortsatt aktiv bare som eksplisitt pilot;
- runtime er aktiv;
- `AHA_API_VERSION` er identisk med activation-SHA;
- live image er `aha-canonical-api:<activation SHA>`;
- JSON-allowlisten bruker en **versjonspinnet** Key Vault-URI;
- allowlisten inneholder legacy anchor og kandidaten;
- allowlist-antallet er identisk med activation evidence;
- listen har unike profiler og er fortsatt innenfor grensen 2–10;
- public health rapporterer samme revision og samme `allowedProfileCount`;
- database er connected, canonical schema finnes og runtime-rollen er safe.

Ingen profil-ID skrives til evidence.

## Port 3 – ekte kandidat, ende til ende

Med kandidatens protected access token utføres bare to GET-kall mot den virkelige production-API-en.

### Kandidaten må kunne lese sitt eget workspace

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

Dette beviser samtidig:

```text
virkelig JWT
→ server-side protected allowlist
→ NestJS auth
→ runtime PostgreSQL role
→ request.jwt.claims
→ current_profile_id()
→ workspace-tenancy
→ bootstrap_sync_snapshot_v1()
```

### Kandidaten må fortsatt avvises fra legacy-pilotens workspace

Samme access token brukes read-only mot:

```text
GET /v1/sync/bootstrap
workspaceId = personal-<legacy anchor>
```

Krav:

```text
HTTP 403
```

Dette er production-beviset på at profil #2 ikke får lese profil #1 sitt private workspace gjennom den faktiske API-/databasekjeden.

## Port 4 – rollback dry-run

Etter vellykket tilgangsverifikasjon beregnes en rollback **kun i minnet**:

```text
current protected allowlist
→ fjern kandidaten
→ behold legacy anchor
→ nytt antall = gammelt antall - 1
```

Krav:

- kandidaten finnes i dagens allowlist;
- kandidaten er ikke legacy anchor;
- nøyaktig én profil fjernes;
- legacy anchor står igjen;
- minst én profil står igjen.

Dette er bare en **rollback dry-run**. Workflowen kjører ikke:

```text
az keyvault secret set
az deployment group create
az containerapp job
add_pilot_profile
deactivate_pilot
POST /v1/sync/push
```

Den eksisterende per-profile rollback-workflowen er fortsatt den eneste operasjonen som faktisk kan redusere allowlisten.

## Evidence

En vellykket kjøring produserer et non-identifying artifact:

```text
pilot-post-activation-verification.json
```

Evidence inneholder blant annet:

```text
activation Git SHA
verification Git SHA
activation run id
candidate fingerprint
allowed profile count
live revision matches activation = true
version-pinned allowlist verified = true
candidate own bootstrap verified = true
cross-profile read denied = true
rollback dry-run ready = true
production mutation performed = false
Key Vault written = false
API deployment changed = false
canonical data mutated = false
candidate identity rendered = false
access token rendered = false
```

## Ingen production-mutasjon

Denne workflowen er med vilje ute av stand til å endre production. Den har ingen Key Vault-write, ingen deployment, ingen DB-control job og ingen canonical push.

Merge av workflowen gjør heller ikke noe automatisk. Den kan bare startes manuelt etter at en faktisk ny pilotprofil er valgt, aktivert og har fått et protected candidate access token.

## Operativ sekvens for profil #2

Når profil #2 faktisk skal tas inn, er sekvensen nå:

```text
1. velg profil #2
2. sett protected AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID
3. kjør read-only expansion gate
4. kjør same-SHA expansion activation
5. sett protected AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN
6. kjør post-activation verification
7. godkjenn først deretter profil #2 som verifisert production-pilot
```

Hvis post-activation verification feiler, skal profilen ikke regnes som godkjent. Den eksisterende per-profile rollback-workflowen kan da brukes for å fjerne kandidatens API-eligibility uten å slette canonical data eller slå av de øvrige pilotprofilene.
