# AHA Canonical Sync Staging Activation v1

Status: **isolert browser staging-surface implementert, production og Home fortsatt deaktivert**.

Denne leveransen oppretter den første kontrollerte browserflaten som kan kalle `AHACanonicalManualSyncRunner` mot en faktisk NestJS staging-API. Den endrer ikke den gamle Sync Hub-aktiveringsmodellen, aktiverer ikke Home og oppretter ikke `sync.html`.

## Egen staging-side

Operatorflaten er:

```text
canonical-sync-staging.html
```

Den er bevisst:

- ikke lenket fra `index.html`;
- merket `noindex,nofollow`;
- isolert fra den gamle `AHASyncHub`/`AHAManualSyncAdapter`-kjeden;
- uten Lists/Paths/Groups/AHAavisa runtime;
- uten `ahaAuth.js`;
- uten sync-, auth- eller databasekall ved page load. Vanlige statiske CSS/JS-ressurser lastes som normalt.

Siden laster bare minimal Supabase browser bootstrap (`ahaConfig.js` + `ahaDb.js`) og canonical sync-kjeden:

```text
AHACanonicalSyncHash
→ AHACanonicalSyncStore
→ AHALocalAccountImport
→ AHACanonicalFrontendSyncAdapter
→ AHACanonicalLocalApplyAdapter
→ AHACanonicalSyncApiClient
→ AHACanonicalManualSyncRunner
→ AHACanonicalSyncStagingBridge
```

## Hvorfor `ahaAuth.js` ikke lastes

Dagens `ahaAuth.js` registrerer auth-state-listener og binder auth-UI ved page load. Dette er riktig på produktflatene, men unødvendig på en sync-rehearsal-side.

Staging-bridgen oppretter derfor en **lazy session provider** direkte over `AHADb.getClient().auth.getSession()`. Den blir ikke rørt når siden lastes. Session leses først dersom operatøren faktisk passerer alle staging-porter og trykker kjør.

Dermed kan ingen av disse bli sync-trigger:

```text
login
aha:auth-ready
SIGNED_IN
TOKEN_REFRESHED
storage
visibilitychange
timer / interval
page load
```

## Fire samtidige execute-porter

`AHACanonicalSyncStagingBridge.execute()` nekter å kjøre med mindre alle fire er oppfylt:

1. URL-en er åpnet eksplisitt med:

```text
?ahaCanonicalStaging=1
```

2. Operatøren oppgir en eksplisitt NestJS staging API-origin.
3. Operatøren oppgir en eksplisitt personal `workspaceId`.
4. Operatøren krysser av samtykke og skriver nøyaktig:

```text
RUN_AHA_CANONICAL_STAGING_SYNC
```

Bridgen sender deretter alltid:

```text
explicitUserAction: true
```

til manual runneren.

## API-origin-regler

Stagingflaten aksepterer bare en ren origin:

```text
https://aha-api-staging.example
```

Den avviser:

- URL med brukernavn/passord;
- query eller fragment;
- API-path i base-URL;
- HTTP utenfor localhost;
- samme origin som den statiske AHA-siden.

Dermed kan man ikke ved et uhell peke runneren tilbake på GitHub Pages eller bake credentials inn i skjemaet.

Det finnes heller ikke noe inputfelt for access token/JWT. Bearer-token leses fra brukerens eksisterende AHA Supabase-session først inne i det eksplisitte API-kallet.

## Hva resultatsiden viser

Staging-resultatet er bevisst redusert til operasjonelle tellinger:

- lokale canonical objekter;
- endrede objekter;
- outbox-enqueue;
- synkroniserte objekter;
- bootstrap apply;
- delta apply;
- antall konflikter;
- konflikttyper og telling.

Den viser aldri:

```text
raw canonical payload
local payload
serverState
bearer token
rå konfliktobjekter
```

Konfliktdata ligger fortsatt i IndexedDB-outboxen for senere eksplisitt konfliktbehandling, men operatorflaten gjengir dem ikke.

## Home og gammel Sync Hub er fortsatt urørt

Dette er **ikke** aktiveringen som de gamle A–J-gatene beskriver.

Følgende permanent viktige grenser består:

- Home remains read-only.
- `index.html` laster ikke canonical sync runtime.
- Den gamle manual-sync-adapteren forblir preview/no-op.
- `sync.html` opprettes ikke.
- `syncFromDatabase()` brukes ikke som canonical motor.
- Auto-sync er fortsatt forbudt.

Canonical staging-siden er en separat test-/operatorflate for den nye PostgreSQL/NestJS-arkitekturen og skal ikke brukes som en bakvei til gammel Sync Hub execution.

## Hosted staging som allerede finnes

Canonical PostgreSQL er allerede rehearsed mot det isolerte Supabase-prosjektet **AHA Staging**, project-ref:

```text
sstuzwppsheivczyqrim
```

Den eksisterende hosted preflighten er fortsatt en egen read-only `workflow_dispatch`-port og skal ikke blandes sammen med browser sync-kjøringen.

## Det som fortsatt mangler før ekte browser → PostgreSQL-kjøring

Frontendgrensen er nå klar, men repoet har fortsatt ikke en hostet NestJS staging-API-origin koblet til operatorflaten.

Før den reelle matrisen kan kjøres må staging API-deployment ha:

```text
AHA_DATABASE_ENABLED=true
AHA_CANONICAL_SYNC_ENABLED=true
AHA_DATABASE_URL=<least-privilege staging runtime DSN>
AHA_DATABASE_SSL_MODE=verify-full
AHA_ALLOWED_ORIGINS=<operator page origin>
AHA_AUTH_ISSUER=<AHA auth issuer>
AHA_AUTH_AUDIENCE=<expected audience>
AHA_AUTH_JWKS_URL=<HTTPS JWKS>
AHA_AUDIT_HASH_SALT=<secret>
```

Dette er **staging-only**. Ingen av disse flaggene skal endres i production som del av denne leveransen.

## Reell staging-testmatrise

Når NestJS staging-origin er tilgjengelig, kjøres denne sekvensen i en ekte browser med en eksplisitt personal workspace:

1. åpne `canonical-sync-staging.html?ahaCanonicalStaging=1`;
2. kontroller at ingen sync-, auth- eller database-request skjer før submit;
3. oppgi staging API-origin + workspace-ID;
4. skriv confirmation phrase og bekreft consent;
5. kjør første sync;
6. verifiser push i canonical PostgreSQL;
7. verifiser bootstrap med fast high-watermark;
8. verifiser umiddelbar delta pull;
9. endre ett lokalt canonical objekt og kjør på nytt;
10. verifiser at bare endringen pushes;
11. fremprovoser stale revision og verifiser konflikt uten lokal auto-overwrite;
12. slett et kjent lokalt canonical objekt og verifiser revision-aware delete/tombstone;
13. kontroller at Notes/Gallery/Feed/Insta/Music/Training/Personal AI/workbench er bit-for-bit urørt;
14. kontroller at page refresh/login/token refresh ikke starter sync.

## Testlås

`tests/aha-canonical-sync-staging-activation-v1.test.cjs` låser blant annet:

- ingen Home-loading eller Home-lenke;
- ingen legacy runtime på staging-siden;
- ingen `ahaAuth.js` på staging-siden;
- ingen auth/storage/timer execution triggers;
- query gate + confirmation + explicit consent;
- HTTPS/separat API-origin;
- lazy session lookup;
- ingen token/payload/serverState i staging summary;
- single-flight execute.

## Neste leveranse

Neste port er **NestJS hosted staging deployment + real canonical browser matrix**. Først etter dokumentert grønn ende-til-ende-staging skal vi vurdere en egen konfliktvalgflate og senere production activation. Home og auto-sync skal fortsatt ikke endres som følge av stagingbeviset.
