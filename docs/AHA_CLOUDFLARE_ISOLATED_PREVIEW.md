# AHA på egen Cloudflare-konto – isolert Pages-test

**Status 14.11.2026:** Statisk testversjon publisert til Cloudflare Pages-grenen `aha-preview` via manuell GitHub Actions. Preview-URL er `https://aha-preview.aha-echonet-preview.pages.dev/`. Cloudflare Access ble konfigurert for `*.aha-echonet-preview.pages.dev` med én tillatt e-postadresse og innloggingskrav testet fra privat Safari-vindu. Produksjonsgrenen `main` er fremdeles ikke publisert på Cloudflare; rotadressen viser «Nothing is here yet». Ingen migrering av database eller backend er utført.

## Avgrensning

- Fysen beholder sin Cloudflare-konto og eksisterende GitHub-integrasjon.
- AHA får **egen Cloudflare-konto**, separat konto-ID, API-token og GitHub Environment.
- Fordi begge repositoryene eies av samme GitHub-konto, brukes **Direct Upload fra GitHub Actions** – ikke en ekstra Cloudflare–GitHub Apps-integrasjon.
- Dagens GitHub Pages-workflow i `.github/workflows/pages.yml` er uendret.
- Kun AHA sine statiske frontendfiler pakkes; `server.js`, `backend/`, `supabase/`, `.github/`, `scripts/`, `.env*`, lokale konfigurasjoner og tester distribueres ikke.
- Ingen databaseflytting, endrede DNS-poster, nye API-endepunkter, nye lagringsressurser, opplasting av persondata, eller produksjonsaktivering av Feed/Insta.

## Engangsoppsett – må gjøres av kontoeier

1. Opprett/velg en **ny Cloudflare-konto for AHA**, uavhengig av Fysen. Kontoene kan administreres under samme personlige innlogging. Aktiver tofaktorautentisering. Ikke send passord, token eller kontonøkler i chat.
2. I **AHA-kontoen**: Opprett et begrenset API-token med Cloudflare Pages Edit for kun den nye AHA-kontoen; notér konto-ID. Ikke bruk Fysen-tokenet.
3. I `Paradispartiet/AHA-EchoNet` på GitHub, åpne **Settings > Environments**, opprett environment `aha-cloudflare-preview`. Legg til **environment secrets**: `CLOUDFLARE_API_TOKEN` og `CLOUDFLARE_ACCOUNT_ID`. Bruk eventuelt nødvendige approvals for manuell kontroll.
4. Når denne PR-en er gjennomgått og merget til `main`, åpne **Actions > AHA Cloudflare preview (manual only) > Run workflow** på `main`. Bruk prosjekt `aha-echonet-preview` og velg `create_project=true` **kun første gang**. Workflowen oppretter da et Pages Direct Upload-prosjekt med produksjonsgren `main`, og sender frontend til **`aha-preview`-gren** (preview, ikke produksjon).
5. Senere kjøringer: `create_project=false`; prosjektet finnes da allerede. Deploy skjer bare når noen manuelt starter workflowen.

Cloudflare-URL-en fra kjøringsloggen skal brukes til testing, ikke som offentlig AHA-adresse. Preview er i utgangspunktet offentlig tilgjengelig; beskytt den med Cloudflare Access før testing med reelle kontoer eller persondata. `robots.txt` er kun en søkemotoranmodning, **ikke adgangskontroll**.

## Bygg og publiseringskontroll

- `node scripts/build-cloudflare-preview.mjs` lager `.cloudflare-preview-dist/` av allowlistede frontendfiltyper fra webområder.
- `node scripts/check-cloudflare-preview.mjs` sjekker sentrale HTML-sider, lokale CSS/JS-referanser, at forbudte server-/databasefiler ikke finnes i pakken, og `_headers`/robots-noindex. Kjøres både i PR-verifisering og før manuell deploy.
- **Azure-kostnadssperre 16.11.2026:** Bruker bekrefter at Azure ble deaktivert etter en uventet regning, og at faktureringen senere er stoppet. `ops/canonical-sync-production-rollout-v1.json` står med `cost_hold_remote_disabled`, `productionActivationEnabled=false`, `remoteProductionSyncAllowed=false` og aktiv `egressCostHoldActive`. Preview-sjekken feiler ved uventet oppheving av denne sperren og byggingen utelater `canonical-sync-production-pilot.html`. **Ikke** reaktiver Azure, eller aktiver canonical cloud-sync uten eksplisitt ny beslutning og kostnadskontroll.
- `_headers` setter `X-Robots-Tag: noindex`, `X-Content-Type-Options: nosniff` og `Referrer-Policy` på statiske Pages-responser. Dette erstatter **ikke** Cloudflare Access.
- Bygget må inneholde `index.html`, `feed.html`, `insta.html` og kjerneskript/CSS, ellers feiler det.
- Frontend-commit SHA settes på samme `ahaChatInsightPipeline.js`-markør som GitHub Pages.
- **Publiseringsjobben** har bare `contents: read`-rettighet til GitHub og kjører kun ved `workflow_dispatch` fra `main`. Egen offline pakkekontroll kjører også på relevante PR-er uten secrets.
- Cloudflare-sekreter må være lagt inn i AHA-miljøet; fravær stopper kjøringen.
- Ingen automatisk deploy på push, merge eller PR. Grønn PR-kontroll er ikke det samme som vellykket Cloudflare-deploy.

## Godkjenningsliste før eventuell omlegging

- [ ] AHA vises på separat `*.pages.dev` preview-URL med alle bilder, CSS og JS.
- [ ] Alle lenker virker fra domeneroten (ingen utilsiktede `/AHA-EchoNet/`-stier).
- [ ] Chat, Bibliotek, Feed og Insta testes med **syntetisk innhold** på iPad Safari.
- [ ] Ingen API-/CORS-/OAuth-konfigurasjon for nye domener endres uten kontrollert beslutning.
- [ ] Lokal lagring er vurdert: `localStorage` på GitHub Pages blir **ikke automatisk med til et nytt domene**.
- [ ] Ingen faktisk sosial publisering, automatisk innsiktslagring eller backend-sync aktiveres.
- [ ] Ingen hemmeligheter eller server-/SQL-/backendfiler ligger i den publiserte statiske katalogen.
- [ ] Cloudflare Access eller tilsvarende er slått på før bruk av persondata.
- [ ] Fysens Cloudflare-oppsett og AHA GitHub Pages fungerer uendret.

**Først etter en egen godkjenning** vurderes produksjonsdomene, CORS, autentisering, API-flytting, bilde-R2 og eventuell datamigrering.

## Tilbake til privat AHA-lagring uten Azure – portene fra 16.11.2026

**Mål:** Behold AHA på gratis Cloudflare Pages og den separate AHA Supabase-organisasjonen (EchoNet, samlet 39 / 500 MB observert 16.11). Azure er deaktivert, fakturering stoppet ifølge prosjekteier. Ingen betalte nyopprettelser, Azure-reaktivering eller direkte kopiering av persondata før eksplisitt samtykke og gjenopprettbar sikkerhetskopi.

### Port A – bevar kildene (før endring i synk)

1. Behold GitHub Pages og Cloudflare-preview uendret som to separate nettleseropprinnelser; `localStorage` flyttes **ikke** mellom dem. Ikke nullstill Safari, tøm nettsteddata eller slett lokal data mens vi kartlegger innhold.
2. For hver origin/enhet: bruk AHA `privacy.html` sin **avgrensede safe export** der den støtter de aktuelle modulene. Den skal ikke inneholde tokens, OAuth/PKCE eller andre hemmeligheter. Kontroller eksporten og lagre den privat – ikke i GitHub.
3. Gjør lesebasert inventar i AHA Supabase DB-03 (prosjektref `wshmybqyksrwkawqleiz`): tabeller, RLS, Auth, størrelse, kvoter og nåværende brukerdata. **Ingen SQL-endring på dette stadiet.**
4. Azure DB-05 og tidligere toprofil-pilot er en egen, deaktivert datakilde. Eksistensen av en gammel PITR-restore-test er ikke bevis på at en eksport eller backup fortsatt finnes. Undersøk dette uten å reaktivere Azure.

### Port B – Supabase Auth på Cloudflare-preview

1. I **AHA sin egen** Supabase-konto, åpne **Authentication → URL Configuration** for `wshmybqyksrwkawqleiz`.
2. Behold dagens GitHub Pages Site URL og eksisterende redirect-adresser. **Legg til nøyaktig** `https://aha-preview.aha-echonet-preview.pages.dev/auth-callback.html` i Redirect URLs, uten wildcard.
3. Kontroller at Cloudflare Access fortsatt beskytter preview. AHA bruker Supabase **PKCE**, slik at sign-in må starte og avsluttes på **samme** preview-origin. En callback på GitHub Pages kan ikke hente PKCE-verifieren fra Cloudflare-lagringen.
4. Først etter at Redirect URL er bekreftet kan denne origin-routing-PR-en merges og **manuell** Pages-preview deployes fra `main`; aldri automatisk deploy eller endring av produksjons-Site-URL.
5. Test én privat testprofil på iPad Safari: logg inn, bekreft `auth-callback.html` på preview-origin, bekreft riktig `aha_profiles`-rad og utlogging. Kontroller at feil konto ikke får lese testprofilens data. Ingen automatiske content-importer.
6. **Sikkerhetsgrense:** `AHAChamberSync` er eksplisitt deaktivert på Cloudflare-preview under Auth-testen, da den gamle modulen ellers kan kjøre pull/push automatisk på `aha:auth-ready`. Dette endrer ikke GitHub Pages. AHA Feed/Insta forblir lokal-only i preview.

### Port C – trygg personvernbevisst synk (senere separat implementasjon)

1. Kartlegg kilde til måltabell med eksisterende `docs/AHA_LOCAL_TO_CANONICAL_MAPPING_V1.md`, `supabase/schema.sql`, `supabase/policies.sql` og `supabase/migrations/README.md`; **ikke** importer alle lokale nøkler. Det gamle `public.aha_*`-laget og det private canonical `aha.*`-laget er to ulike modeller.
2. Verifiser RLS med **to forskjellige testbrukere** (A kan ikke lese, endre eller slette B), least-privilege, samtykke, konfliktregler og idempotens. `auth.uid()`-policyer i kildekoden må faktisk være installert og aktivert i databasen før testing med reelle data.
3. Opprett **en manuelt initiert, reversibel** import av godkjente samtaler, kilder og innsikter fra en privat, kontrollert eksport. Første test kun syntetiske data; deretter én samtykkende profil, med tellinger, hash, eksport/restore-bevis og rollback.
4. Ikke flytt lokale bilder/data-URL-er inn i JSONB. Det finnes ennå ikke en godkjent privat bildeopplastingsløsning. Feed/Insta sosial produksjonsbackend i PR #1035 er staging-only og en separat arbeidsstrøm.
5. Velg Supabase DB-03 som *kandidat*, **ikke automatisk mål**, for canonical lagring: selve tabellene, sikkerhetsmodellen og skrive-/lesekostnadene må vurderes før drift. Ingen automatisk bakgrunnssynk, ingen offentlig deling, ingen Azure.
6. Kontroller månedlig databaseforbruk og eksport; Supabase Free har **ikke automatiske databasebackuper**. Manuell trygg eksport/gjenoppretting er nødvendig, og kvotene må holdes under Free-grensene.

**Felles statuskilde:** [Paradispartiets databaseregister](https://github.com/Paradispartiet/Paradispartiet/blob/main/docs/DATABASE_REGISTER.md). Denne planen er ikke et eget databaseregister. Endrede databaser og faktisk verifiserte migreringer føres bare i hovedregisteret.

## Etterkontroll 14.11.2026 og gjenstående grenser

- Visuell test på iPad Safari har vist Home, Chat og Insta med riktig CSS/navigasjon. Dette er **ikke** bevis for at AI-modell, innlogging i AHA eller databasepersist fungerer fra ny origin.
- Access-policyen for preview var i Cloudflare UI avgrenset til én e-postadresse. Test i privat Safari-vindu utløste Cloudflare-innlogging. Denne beskyttelsen gjelder wildcard-preview, **ikke** produksjonsroten `aha-echonet-preview.pages.dev`.
- `js/ahaConfig.js` peker fremdeles på GitHub Pages for `AHA_APP_URL` og `AHA_AUTH_CALLBACK_URL`. Supabase OAuth/PKCE, redirect allowlist, CORS og autentisert databasebruk fra Cloudflare-domenet er **ikke** produksjonsgodkjent. Ikke aktiver dette bare ved å endre URL.
- AI-backend brukes fortsatt eksternt via konfigurert Render-adresse; ingen egen Cloudflare Worker for modellkjøring er opprettet.
- Bruker har bekreftet at Azure-faktureringen er stoppet, men **Azure-data-/backupstatus er ikke verifisert**. Det tidligere aktive toprofilforsøket er historikk, ikke live-tilgjengelighet. Felles databaseoversikt: [DATABASE_REGISTER.md](https://github.com/Paradispartiet/Paradispartiet/blob/main/docs/DATABASE_REGISTER.md).
- Innlogging på Cloudflare Pages er fortsatt en separat testport: AHA Auth redirect i `js/ahaConfig.js` peker mot GitHub Pages. Ikke endre automatisk til Cloudflare før godkjente redirect-URL-er er kontrollert i AHA sin **egen Supabase-konto**. Cloudflare Access-innlogging er ikke det samme som Supabase Auth.
- Separat Cloudflare-origin får separat `localStorage`. Ikke forvent at tidligere chatlogg, poster eller lokal History Go-import dukker opp på ny origin.

### Manuell funksjonstest – syntetiske data, ingen ekte brukerinformasjon

1. Åpne `aha-preview.aha-echonet-preview.pages.dev` i privat Safari-vindu. Cloudflare Access skal be om autentisering før appen lastes.
2. Gå til Home, Chat, Feed og Insta; kontroller at ingen CSS/JS mangler, og at intern navigasjon ikke sender deg til GitHub Pages.
3. Feed: opprett én tydelig merket, syntetisk lokal testpost; last siden på nytt og bekreft at den vises; slett posten. Kontroller ingen offentlig deling.
4. Insta: bruk bare en syntetisk eller selvlaget testressurs. Kontroller opprettelse, lokal forhåndsvisning, oppfriskning og sletting. Ikke importer privat bildebibliotek i preview-test.
5. Chat: kontroller først inputfelt og knapper uten å sende personopplysninger. Reell AI-kalling, kostnader og innsiktslagring krever separat autorisert gjennomspill og kildekontroll.
6. Innlogging/Sync Hub: **ikke** endre Supabase redirect-URL, CORS, RLS eller aktivere fjernsynk før separat sikkerhetsgjennomgang.
7. Kontroller at `aha-echonet-preview.pages.dev` fortsatt ikke viser AHA-appen. Ingen produksjonspublisering før eksplisitt beslutning.

**Klareringskriterium:** Testmiljøet er teknisk publisert, men AHA-backend/brukerkontoer/synkronisering er fortsatt ikke verifisert som fungerende på Cloudflare.
