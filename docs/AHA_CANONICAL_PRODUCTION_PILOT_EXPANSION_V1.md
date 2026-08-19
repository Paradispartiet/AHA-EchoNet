# AHA Canonical Production Pilot Expansion v1

Status: **foundation, read-only gate, same-SHA activation og per-profile rollback er implementert i repoet. Ingen ny production-profil aktiveres ved merge.**

Dagens operative production-status forblir den eksisterende pilotflåten helt til en operatør eksplisitt kjører expansion gate og deretter expansion activation for én valgt profil. Denne leveransen kjører ikke noen production-workflow, endrer ikke live allowlist og deployer ikke production.

## Formål

Production-piloten kan nå utvides kontrollert fra én til maksimalt ti profiler uten å åpne automatisk synkronisering eller svekke workspace-isolasjonen.

Repo-policyen tillater nå:

```text
maks 10 profiler totalt
maks 1 ny profil per eksplisitt activation
ingen automatisk expansion
ingen background/login/auth-ready sync
ingen automatisk destruktiv rollback
```

Dette er en **kapasitetsgrense i kode og policy**, ikke en påstand om hvor mange profiler som er live. Live antall endres bare av den manuelle activation-workflowen.

## Tre manuelle kontrollpunkter

### 1. Read-only expansion gate

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-expansion-gate.yml
```

Bekreftelse:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_EXPANSION_GATE
```

Kandidaten kommer fra protected environment-secret:

```text
AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID
```

Gaten:

1. krever `main` og eksakt manuell bekreftelse;
2. krever en allerede aktiv og healthy production-pilot;
3. krever at kandidat-ID er en annen gyldig UUID enn legacy pilot-ankeret;
4. bygger et immutable DB-verifikasjonsimage på `GITHUB_SHA`;
5. kjører `verify_pilot_expansion` i et kortlivet Container Apps Job inne i production-VNet;
6. tvinger `default_transaction_read_only=on`;
7. krever konsistent eksisterende profil/workspace-flåte og ledig kandidat;
8. skriver non-identifying evidence;
9. binder evidence til både **Git-SHA og SHA-256-fingerprint av kandidaten**;
10. rydder short-lived job og kandidat-secret.

Kandidatens UUID skrives ikke i evidence. Fingerprintet gjør at en gate for kandidat A ikke kan gjenbrukes for kandidat B dersom environment-secret endres mellom gate og activation.

Gaten har fortsatt **ingen** `add_pilot_profile`, API-deploy, allowlist-mutasjon eller runtime credential rotation.

### 2. Same-SHA expansion activation

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-expansion-activation.yml
```

Bekreftelse:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_EXPANSION_ACTIVATION
```

Activation bruker samme protected candidate-secret som gaten og nekter å kjøre dersom den ikke finner et vellykket expansion-gate artifact som matcher:

```text
samme main Git-SHA
samme candidate fingerprint
read-only gate = pass
profileAdded = false
allowlistChanged = false
apiDeploymentChanged = false
```

Deretter skjer aktiveringen i denne rekkefølgen:

1. les og valider dagens aktive protected allowlist;
2. bekreft health og dagens `allowedProfileCount`;
3. bygg API- og DB-control-image fra activation-workflowens eksakte `GITHUB_SHA`;
4. bootstrap **bare kandidaten** med idempotent `add_pilot_profile`;
5. behold eksisterende runtime credential og den delte least-privilege runtime-rollen uendret;
6. bygg ny allowlist = eksisterende profiler + nøyaktig én kandidat;
7. lag en **ny versjon** av Key Vault-secret `aha-production-pilot-profile-ids-json`;
8. deploy API-et fra samme Git-SHA med den eksakte, versjonspinnede allowlist-secret-URI-en;
9. krev healthy runtime og `allowedProfileCount = tidligere antall + 1`;
10. skriv non-identifying activation evidence.

Activation roterer ikke runtime credential. Den endrer heller ikke automatic, login-triggered, auth-ready eller background sync.

### Incomplete activation rollback

Dersom kandidatens canonical profil/workspace blir bootstrappet, men API-aktiveringen ikke fullføres, slettes ikke dataene.

Workflowen gjenoppretter i stedet:

```text
forrige API-image
forrige AHA_API_VERSION
forrige protected allowlist
```

Kandidaten blir dermed utilgjengelig gjennom API-et, mens canonical data beholdes for kontrollert forward-fix eller senere eksplisitt behandling.

### 3. Per-profile rollback

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-profile-rollback.yml
```

Bekreftelse:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_PROFILE_ROLLBACK
```

Rollback-target kommer fra et separat protected environment-secret:

```text
AHA_PRODUCTION_PILOT_ROLLBACK_PROFILE_ID
```

Denne rollbacken er laget for **én utvidet profil**, ikke for å slå av hele piloten.

Den:

1. krever en aktiv expanded JSON-allowlist;
2. krever at target faktisk finnes i allowlisten;
3. nekter å fjerne legacy pilot-ankeret;
4. lager ny allowlist med nøyaktig target fjernet;
5. lager en ny versjonspinnet Key Vault-secret;
6. deployer samme live API-image og samme `AHA_API_VERSION` med redusert allowlist;
7. krever at `allowedProfileCount` synker med nøyaktig én;
8. beholder canonical profil, workspace og data.

Per-profile rollback kjører **ikke** `deactivate_pilot`, setter ikke den delte PostgreSQL-runtime-rollen til `NOLOGIN` og terminerer ikke de øvrige pilotprofilenes databaseadgang. Den fjerner target fra API-allowlisten først og lar database-tenancy fortsette som autoritativ isolasjonsgrense.

Legacy pilot-ankeret kan bare stenges gjennom den eksisterende full-pilot emergency rollback-workflowen, fordi det er en global runtime-cutoff og en annen operasjon enn per-profile rollback.

## Versjonspinnet allowlist

Production IaC støtter:

```text
AHA_CANONICAL_SYNC_PILOT_PROFILE_ID
AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON
```

`AHA_CANONICAL_SYNC_PILOT_PROFILE_ID` beholdes som legacy anchor og må alltid finnes i JSON-allowlisten.

Ved expansion og per-profile rollback oppdateres ikke bare verdien bak en stabil Key Vault-URI. Workflowen lager en ny secret-versjon og sender den **eksakte versioned URI-en** inn i Container Apps-revisjonen. Dermed er hver API-revisjon deterministisk bundet til den allowlisten den faktisk skal bruke.

Regler:

- JSON-allowlisten må være en liste av unike UUID-er;
- legacy pilot-ID må fortsatt finnes;
- maks 10 profiler er hardkodet og låst i policy;
- hver expansion legger til nøyaktig én profil;
- public health viser bare `allowedProfileCount`, aldri ID-ene.

## Database-isolasjon

Canonical database authorization er fortsatt workspace-basert og JWT-subject-basert:

```text
verified JWT subject
→ current_profile_id()
→ owner/membership role
→ can_read_workspace()/can_edit_workspace()
```

PostgreSQL-16-valideringen materialiserer to private pilotprofiler og krever:

```text
A → eget personal workspace: bootstrap tillatt
B → eget personal workspace: bootstrap tillatt
A → B sitt personal workspace: bootstrap AVVIST
A → B sitt personal workspace: push AVVIST
runtime direct table writes: 0
```

API-allowlisten er dermed første port; database-tenancy er fortsatt den autoritative andre porten.

## DB-control primitives

`verify_pilot_expansion`:

- read-only;
- runtime må allerede være LOGIN og least privilege;
- dagens pilotflåte må inneholde 1–9 konsistente profiler/workspaces;
- kandidaten må ikke finnes;
- ingen mutation.

`add_pilot_profile`:

- brukes bare av den separate expansion activation-workflowen;
- krever runtime allerede LOGIN;
- oppretter kun kandidatprofil + `personal-<subject>` private workspace;
- endrer ikke runtime-passord eller funksjonsprivilegier;
- er idempotent ved retry;
- nekter mer enn 10 aktive pilotprofiler.

## Hva merge av denne leveransen ikke gjør

Merge alene:

```text
legger ikke til profil
kjører ikke expansion gate
kjører ikke expansion activation
kjører ikke per-profile rollback
endrer ikke live Azure allowlist
endrer ikke live Key Vault-secret
endrer ikke production API revision
roterer ikke runtime credential
slår ikke på automatic/login/auth-ready/background sync
sletter ikke canonical data
```

Først når profil nummer to er valgt, kandidat-secret er satt, read-only gaten er kjørt på den aktuelle `main`-SHA-en og activation eksplisitt startes, kan live production gå fra én til to profiler.
