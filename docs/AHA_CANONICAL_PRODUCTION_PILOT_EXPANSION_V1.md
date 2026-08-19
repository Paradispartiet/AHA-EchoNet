# AHA Canonical Production Pilot Expansion v1

Status: **foundation + read-only gate only. Ingen ny production-profil aktiveres av denne leveransen.**

Dagens operative production-status forblir én eksplisitt pilotprofil med manuell sync. `ops/canonical-sync-production-rollout-v1.json` beholder derfor `pilot.maxProfiles = 1` inntil en senere separat, reviewet activation-leveranse faktisk endrer denne grensen.

## Formål

Denne leveransen fjerner den tekniske antakelsen om at API-koden for alltid bare kan forstå én pilot-ID, samtidig som den **ikke** gjør production bredere.

Foundation består av:

- bounded protected API-allowlist med absolutt kodegrense på 10 profiler;
- backward compatibility med dagens `AHA_CANONICAL_SYNC_PILOT_PROFILE_ID`;
- Key Vault-backed JSON-allowlist for en senere expansion-activation;
- `verify_pilot_expansion` som read-only database preflight;
- `add_pilot_profile` som idempotent DB-control primitive for en senere separat workflow;
- levende PostgreSQL 16-test av cross-profile read/write-isolasjon;
- en manuell **read-only production expansion gate** som kan produsere evidence uten å legge til en profil.

## Viktig: tre forskjellige grenser

### 1. Merge

Merge av foundation endrer bare repoet. Den:

```text
legger ikke til profil
endrer ikke Key Vault allowlist
endrer ikke production API revision
roterer ikke runtime credential
endrer ikke runtime LOGIN/NOLOGIN
slår ikke på background sync
```

### 2. Expansion gate

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
2. krever at dagens production-pilot fortsatt er aktiv og healthy;
3. krever at kandidat-ID er en annen gyldig UUID enn dagens pilot;
4. bygger et immutable DB-verifikasjonsimage;
5. kjører `verify_pilot_expansion` i et kortlivet Container Apps Job inne i production-VNet;
6. tvinger `default_transaction_read_only=on`;
7. krever konsistent eksisterende profil/workspace-flåte og ledig kandidat;
8. skriver non-identifying evidence;
9. rydder short-lived job og kandidat-secret.

Gaten har bevisst **ingen** `add_pilot_profile`, API-deploy eller allowlist-mutasjon.

### 3. Fremtidig expansion activation

Ikke implementert i denne leveransen.

En senere separat PR må minst:

- kreve en grønn expansion gate på samme Git-SHA;
- bootstrappe bare den ene kandidaten som gaten godkjente;
- bygge ny protected JSON-allowlist uten å miste eksisterende pilot;
- deploye API-et med nøyaktig samme allowlist;
- kreve health med forventet `allowedProfileCount`;
- verifisere at eksisterende pilot fortsatt fungerer;
- verifisere at kandidaten bare kan bruke sitt eget private workspace;
- ha fail-closed rollback som først fjerner kandidaten fra API-allowlisten;
- aldri slette kandidatens canonical data som automatisk rollback.

## API allowlist

Canonical sync-konfig støtter nå:

```text
AHA_CANONICAL_SYNC_PILOT_PROFILE_ID
AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON
```

Regler:

- uten JSON-allowlist fungerer dagens single-ID secret som før;
- JSON-allowlisten må være en liste av unike UUID-er;
- maks 10 profiler er hardkodet i denne foundation-versjonen;
- dersom legacy pilot-ID også er satt, må den fortsatt finnes i JSON-listen;
- public health viser bare `allowedProfileCount`, aldri ID-ene.

## Database-isolasjon

Canonical database authorization er fortsatt workspace-basert og JWT-subject-basert:

```text
verified JWT subject
→ current_profile_id()
→ owner/membership role
→ can_read_workspace()/can_edit_workspace()
```

Den nye PostgreSQL 16-valideringen materialiserer to private pilotprofiler og krever:

```text
A → eget personal workspace: bootstrap tillatt
B → eget personal workspace: bootstrap tillatt
A → B sitt personal workspace: bootstrap AVVIST
A → B sitt personal workspace: push AVVIST
runtime direct table writes: 0
```

Dermed er API-allowlisten bare første port; database-tenancy er fortsatt den autoritative andre porten.

## DB-control primitives

`verify_pilot_expansion`:

- read-only;
- runtime må allerede være LOGIN og least privilege;
- dagens pilotflåte må inneholde 1–9 konsistente profiler/workspaces;
- kandidaten må ikke finnes;
- ingen mutation.

`add_pilot_profile`:

- er **ikke koblet til en production activation-workflow ennå**;
- krever runtime allerede LOGIN;
- oppretter kun kandidatprofil + `personal-<subject>` private workspace;
- endrer ikke runtime-passord eller funksjonsprivilegier;
- er idempotent ved retry;
- nekter mer enn 10 aktive pilotprofiler.

## Fortsatt av

Denne foundation-leveransen endrer ikke:

```text
pilot.maxProfiles = 1 i live policy
automatic sync = false
login-triggered sync = false
auth-ready-triggered sync = false
background sync = false
local import = false
group/public canonical sharing = ikke aktivert
```

Først en separat expansion activation med egen review, same-SHA gate og production evidence kan endre den operative profilgrensen.
