# AHA Canonical Production Pilot Expansion v1

Status: **foundation, read-only gate, same-SHA activation, post-activation verification og per-profile rollback er implementert. Production har nå nøyaktig 2 verifiserte profiler. Videre expansion er pauset til begge har bestått real-data round-trip.**

## Dagens operative grense

Production-piloten er en bounded manual allowlist med:

```text
2 verifiserte profiler live nå
maks 10 profiler totalt
maks 1 ny profil per eksplisitt activation
ingen automatisk expansion
ingen background/login/auth-ready sync
ingen automatisk destruktiv rollback
```

Dette er fortsatt en pilotkapasitet, ikke generell production-sync.

Profil #2 er allerede kjørt gjennom hele expansion-kjeden:

```text
candidate
→ read-only expansion gate
→ same-SHA expansion activation
→ immutable version-pinned allowlist
→ own workspace bootstrap 200
→ cross-profile private workspace 403
→ per-profile rollback dry-run
→ verified production pilot
```

**Profil #3 skal ikke aktiveres nå.** `ops/canonical-sync-production-rollout-v1.json` krever først real-data round-trip evidence fra begge eksisterende profiler.

## 1. Read-only expansion gate

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
9. binder evidence til både Git-SHA og SHA-256-fingerprint av kandidaten;
10. rydder short-lived job og kandidat-secret som workflowen selv materialiserer.

Kandidatens UUID skrives ikke i evidence. Gaten har ingen `add_pilot_profile`, API-deploy, allowlist-mutasjon eller runtime credential rotation.

## 2. Same-SHA expansion activation

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-expansion-activation.yml
```

Bekreftelse:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_EXPANSION_ACTIVATION
```

Activation nekter å kjøre dersom den ikke finner et vellykket expansion-gate artifact som matcher samme main Git-SHA og samme candidate fingerprint.

Aktiveringen skjer kontrollert:

1. les og valider dagens protected allowlist;
2. bekreft health og dagens `allowedProfileCount`;
3. bygg API- og DB-control-image fra eksakt `GITHUB_SHA`;
4. bootstrap bare kandidaten med idempotent `add_pilot_profile`;
5. behold delt least-privilege runtime credential/role uendret;
6. bygg ny allowlist = eksisterende profiler + nøyaktig én kandidat;
7. lag ny versjon av Key Vault-secret `aha-production-pilot-profile-ids-json`;
8. deploy samme-SHA API med eksakt versjonspinnet allowlist-URI;
9. krev healthy runtime og `allowedProfileCount = tidligere antall + 1`;
10. skriv non-identifying activation evidence.

Activation slår ikke på automatic, login-triggered, auth-ready eller background sync.

### Incomplete activation rollback

Hvis kandidatens canonical profil/workspace blir bootstrappet, men API-aktiveringen ikke fullføres, slettes ikke dataene. Workflowen gjenoppretter forrige API-image, forrige `AHA_API_VERSION` og forrige allowlist.

## 3. Post-activation verification

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-post-activation-verification.yml
```

Denne porten er nå brukt og bestått for profil #2. Den binder kandidaten til faktisk activation evidence og live immutable revision, krever eget private workspace = 200, annen pilots private workspace = 403 og beregner rollback uten mutation.

Detaljer:

```text
docs/AHA_CANONICAL_PRODUCTION_PILOT_POST_ACTIVATION_VERIFICATION_V1.md
```

## 4. Per-profile rollback

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-profile-rollback.yml
```

Bekreftelse:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_PROFILE_ROLLBACK
```

Rollback-target kommer fra:

```text
AHA_PRODUCTION_PILOT_ROLLBACK_PROFILE_ID
```

Rollbacken:

1. krever aktiv expanded JSON-allowlist;
2. krever at target finnes;
3. nekter å fjerne legacy pilot-ankeret;
4. lager ny allowlist med nøyaktig target fjernet;
5. lager ny versjonspinnet Key Vault-secret;
6. deployer samme live API-image og `AHA_API_VERSION` med redusert allowlist;
7. krever at `allowedProfileCount` synker med nøyaktig én;
8. beholder canonical profil, workspace og data.

Per-profile rollback slår ikke av de andre pilotprofilene og sletter ikke canonical data.

## Versjonspinnet allowlist

Production støtter både legacy anchor og expanded JSON-allowlist:

```text
AHA_CANONICAL_SYNC_PILOT_PROFILE_ID
AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON
```

Regler:

- JSON-allowlisten er en liste av unike UUID-er;
- legacy pilot-ID må fortsatt finnes;
- maks 10 profiler er låst i policy;
- hver expansion legger til nøyaktig én profil;
- public health viser bare `allowedProfileCount`, aldri ID-ene;
- hver live API-revisjon bindes til en eksakt versjonspinnet Key Vault-secret-URI.

## Database-isolasjon

Database authorization er fortsatt workspace- og JWT-subject-basert:

```text
verified JWT subject
→ current_profile_id()
→ owner/membership role
→ can_read_workspace()/can_edit_workspace()
```

API-allowlisten er første port; database-tenancy er den autoritative andre porten. Production-verifikasjonen av profil #2 har bevist denne isolasjonen gjennom faktisk API-kjede med eget workspace 200 og annen pilots private workspace 403.

## DB-control primitives

`verify_pilot_expansion` er read-only og krever en aktiv konsistent pilotflåte med ledig kandidat.

`add_pilot_profile` brukes bare av den separate expansion activation-workflowen, er idempotent ved retry, oppretter kun kandidatprofil + `personal-<subject>` workspace og nekter mer enn 10 aktive pilotprofiler.

## Ny expansion-port før profil #3

Expansion-maskineriet er ferdig, men det skal **ikke brukes igjen ennå**.

Før en tredje profil kan gå inn i `candidate → gate → activation` må begge dagens profiler bestå:

```text
docs/AHA_CANONICAL_PRODUCTION_TWO_PROFILE_ROUND_TRIP_V1.md
```

Det krever ekte lokale AHA-data, faktisk push til production, bootstrap/pull tilbake til lokalt lager, cursor/hash-konsistens og identisk replay uten nye writes.

Dette er nå den bindende grensen mellom en teknisk bevist to-profil-pilot og videre pilotutvidelse.
