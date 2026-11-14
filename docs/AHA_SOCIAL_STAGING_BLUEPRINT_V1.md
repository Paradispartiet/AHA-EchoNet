# AHA Feed og Insta – egen, avslått sosial staging

Denne filen er **kun en utkastsmal**: `deploy/render/social-api-staging.yaml`. Den er separat fra `render.yaml` og fra `deploy/render/canonical-api-staging.yaml`. Ingen ny Render-tjeneste, database, domene, kredittkortbelastning eller rettighet opprettes ved å merge malfilen. **Ikke registrer Blueprinten uten separat operatørgodkjenning av drift og kostnad.**

## Standardtilstand

- Navn: `aha-social-api-staging`. Kilde: den eksisterende NestJS-koden i `backend/api`, ingen ny backend.
- `autoDeployTrigger: off`, `NODE_ENV=development` (eksplicit ikke-produksjon). Fysisk staging server finnes ikke før man faktisk oppretter den.
- `AHA_DATABASE_ENABLED=false`, `AHA_SOCIAL_STAGING_ENABLED=false`, `AHA_CANONICAL_SYNC_ENABLED=false`, `AHA_LOCAL_IMPORT_ENABLED=false`, `AHA_RUNTIME_ACTIVATED=false`.
- Ingen database-DSN, JWT-issuer/JWKS, dedikerte runtime-rettigheter eller medieopphav fra malen. Uten dette forblir helseendepunktet det eneste relevante funksjonelle endepunktet; autentiserte sosialruter er ikke tilgjengelige.
- Databaseforbindelse skal bruke `verify-full` og pin'et CA i en særskilt godkjent operatørprosedyre. Ingen staging-/prod-tilgang åpnes av dette dokumentet.

## Før en manuell, *separat* aktivering

1. Godkjenn eventuell Render-kostnad og dedikert stagingdatabase. Bekreft at databaseprosjekt, rolle og secrets er **adskilt** fra produksjonsmiljøet og fra Fysen.
2. Verifiser driftens eksakte tjenestenavn, miljø, domene og TLS før data eller OAuth-kontoer settes opp. Lag ikke en produksjonslignende delt database eller bruk eksisterende private profiler som sosial fixture.
3. Påfør `aha_social`-migrasjoner med en sikker, kontrollert migreringsjobb etter backup/restoreøvelse. Staging runtime skal bare ha schema `USAGE` og de eksplisitt gjennomgåtte toppnivåfunksjonene med `EXECUTE`, aldri tabellgrants eller `require_profile_v1`, `require_moderator_v1` eller oppryddingsrettigheter.
4. Konfigurer test-issuer/JWKS med to separat verifiserte profiler og én manuelt godkjent moderator. Start med flagget `AHA_SOCIAL_STAGING_ENABLED=false` og bevis at sosial API er av før flagget vurderes.
5. Etter egen godkjenning, sett stagingflagget bare på denne tjenesten, test to-konto-manualen i `docs/AHA_SOCIAL_STAGING_TWO_ACCOUNT_SMOKE.md` og gjennomfør fysisk Safari-test på iPad. Gå gjennom lagring, rategrenser, innholdsmoderering, sletting og tilbakeføring.
6. Før lansering vurder varig sikker objektlagring, EXIF, skanning, modereringsberedskap, økonomi og juridisk rett til publisering. Samme prosess må aldri slippe `cost_hold_remote_disabled` i produksjon.

## Verifisering

`node --test tests/aha-social-staging-blueprint.test.cjs` skal bevise at malen er default-off og at den aktive Render-filen og canonical-staging ikke er koblet til den. Den ekte, isolerte tre-konto-NestJS/PostgreSQL-testen i GitHub Actions er bestått, men erstatter ikke godkjenning av faktisk staging og fysisk iPad Safari.

Ingen endringer her skal aktivere en eksisterende canonical synkeflyt eller produksjonsdeling.
