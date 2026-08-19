# AHA Canonical Production Pilot — current status

Status: **AKTIV én-profil-pilot i Azure production, med eksplisitt manuell sync og null automatisk/background sync.**

Dette dokumentet er den operative statuskilden for canonical production-piloten. Eldre arkitektur-/rolloutdokumenter beskriver også pre-deploy- og pre-activation-tilstanden; der slike statuslinjer avviker, gjelder denne filen for faktisk operasjonell status.

## Verifisert produksjonskjede

Følgende kjede er nå gjennomført mot dedikert Azure production:

```text
migration rehearsal
→ Azure production platform deploy
→ ekte backup/PITR restore rehearsal
→ observability readiness
→ read-only production rollout gate
→ same-SHA one-profile activation
→ eksplisitt browser roundtrip
→ identisk idempotens-kjøring
→ manuell sync integrert i AHA Home
```

Production bruker Azure Container Apps og dedikert privat PostgreSQL 16. Staging/legacy-databaser brukes ikke som production-database.

## Rollout- og activation-bevis

Rollout gate:

- GitHub Actions run: `32125812197`
- conclusion: `success`
- Git SHA: `e620543a12df445fd9e507245192cd4cb66d934c`

One-profile activation:

- GitHub Actions run: `32126107290`
- conclusion: `success`
- Git SHA: `e620543a12df445fd9e507245192cd4cb66d934c`
- activation marker: `COMMITTED_ONE_PROFILE`

Rollout-gate og activation brukte dermed nøyaktig samme Git-SHA, som krevd av fail-closed-kontrakten.

Maskinlesbart operatørbevis:

```text
ops/evidence/canonical-sync-production-pilot-proof-v1.json
```

## Browser roundtrip og idempotens

Første vellykkede production browser-sync sendte én canonical endring til production, anvendte serverstate tilbake lokalt og hadde `0` konflikter.

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

Dette er det operative idempotensbeviset: samme state skaper ikke nye writes, duplikater eller konflikter.

Ved første Home-hydration på en klientkontekst ble `localPrepared: 0` rapportert samtidig som `bootstrapApplied: 1`. Dette er forventet av runnerrekkefølgen: `localPrepared` telles før bootstrap, mens serverobjektet anvendes senere i samme eksplisitte kjøring.

## AHA Home

Den separate operatorflaten er fortsatt tilgjengelig som diagnostisk/operativ pilotflate, men normal pilotbruk er nå integrert i AHA Home.

Relevante PR-er:

- `#780` — manuell production canonical sync inn i Home/Sync Hub;
- `#781` — kontrollen flyttet ut av sammenfoldet Systemstatus til synlig Home-flate;
- `#782` — brukertekst forenklet; tekniske tellinger flyttet bak `Tekniske detaljer`.

Home-grensen er fortsatt:

- ingen auth-/storage-/network-sync ved page load;
- `Synkroniser nå` må velges eksplisitt;
- eget samtykke og `Bekreft og synkroniser` kreves for hver kjøring;
- canonical controller/dependencies lazy-loades først etter bekreftelsen;
- ingen automatisk retry.

## Sikkerhetsgrense som fortsatt gjelder

Production-piloten er **ikke** en generell production-lansering.

Følgende er fortsatt eksplisitt av:

```text
automatic sync
login-triggered sync
auth-ready-triggered sync
background sync
local import
multi-profile expansion
group/public canonical sharing
```

API-et håndhever fortsatt én protected pilotprofil server-side. Andre verifiserte JWT-subjects skal avvises. Workspace utledes fra innlogget subject og kan ikke velges manuelt i browseren.

Emergency rollback er fortsatt database-first: runtime-login og aktive sessions kuttes før API-sync slås av. Pilotdata slettes ikke destruktivt.

## Hva som er neste grense

Neste steg skal **ikke** skje automatisk bare fordi én-profil-piloten er grønn.

Før flere profiler får production-sync må en separat reviewet leveranse definere minst:

1. hvem som kan inviteres/allowlistes og hvordan dette administreres;
2. tenant/workspace-isolasjon og negative cross-profile-tester;
3. per-profile observability uten å lekke identitet/rådata;
4. rollback/cutoff for én profil uten å ramme andre;
5. eksplisitt pilotutvidelses-gate og evidence;
6. fortsatt manuell sync som default til den grensen eventuelt endres separat.

Bakgrunnssync eller login-trigger er en enda senere og separat produkt-/sikkerhetsbeslutning.
