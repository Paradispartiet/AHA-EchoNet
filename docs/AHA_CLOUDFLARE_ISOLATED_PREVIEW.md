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

### Port C.0 – kontroller RLS før første private sky-write (16.11)

**Hvorfor:** Innloggingen på Cloudflare er brukerbekreftet, men dette viser **ikke** at databaseoppføringer er sikre eller at `public.aha_*`-tabellene har aktive eierskapspolicyer. Canonical `aha.*`-migrasjonsprøven dekker et **annet** schema.

To ulike og eksplisitt adskilte kontroller er derfor lagt til:

- **Kildebasert CI-test uten persondata:** `.github/workflows/aha-legacy-rls-rehearsal.yml` starter én *disponibel PostgreSQL 16*-database med kun syntetiske brukere A/B. Den installerer gjeldende `supabase/schema.sql`, `supabase/policies.sql` og `supabase/chamber.sql`, og prøver at A ikke kan lese/endre B, B ikke kan se A, og anonym bruker ikke kan lese noen av 12 legacy-tabeller. **Ingen** tilgang til Supabase-prosjekter, Azure, GitHub-secrets eller brukerfiler. Embeddings/pgvector er utenfor denne testen.
- **Faktisk AHA Supabase – bare kataloginnsyn:** `supabase/audits/aha_legacy_readonly_preflight.sql` kan kjøres av kontoeier i SQL Editor i prosjekt **`wshmybqyksrwkawqleiz`**, ikke Fysen. Skriptet har `BEGIN READ ONLY` og leser bare PostgreSQLs systemkataloger for kjente `public.aha_*`-tabeller (inkludert valgfri `aha_insight_embeddings`). Det inspiserer om RLS er aktivt, om forventede owner-policyer finnes og om rollen `authenticated` faktisk har `SELECT`/`INSERT`/`UPDATE` på tabellene; ingen innholdsrader, person-ID-er eller passord hentes. `REVIEW_MISSING_TABLE_GRANT` betyr at tabellrettighetene mangler selv om RLS-policyer kan være til stede. En manglende `GRANT` må vurderes før endring – ikke gi brede tilgangsrettigheter automatisk.
- **Utførbar SQL-kontroll i CI:** Rehearsal-scriptet kjører nå **selve katalog-SQL-en** i den isolerte PostgreSQL-fixturen, og krever 12 `POLICY_PREFLIGHT_OK` for kjerne-tabellene og eksplisitt `MISSING_TABLE` for valgfri embeddings i fixturen. Test-runneren avviser enhver `PGHOST`/`PGDATABASE`/`PGPORT` som ikke peker på lokal, disponibel CI-database. Testen verifiserer dessuten negativt at den skrivebeskyttede SQL-kontrollen faktisk finner en syntetisk `REVOKE UPDATE` på `aha_notes` og først da rapporterer `REVIEW_MISSING_TABLE_GRANT`; rettigheten tilbakeføres i den disponible testdatabasen. Dette validerer SQL-kjørbarhet og grant-deteksjon på testdata, **ikke** faktisk AHA Supabase-status. Supabase Data API må også ha riktig eksponering og skjemaoppsett; SQL-grants og RLS alene er ikke bevis på fungerende REST-tilkobling.

**Tolkning:** `POLICY_PREFLIGHT_OK` betyr kun at de forventede policyuttrykkene *ser ut til* å være installert. En manglende valgfri embeddingtabell må vurderes separat, ikke opprettes automatisk. Katalogkontrollen kan ikke oppdage alle semantiske eller indirekte lekkasjer. **Før første ekte innholdsimport kreves en separat live-test med to godkjente testbrukere fra faktisk browser/API**, bekreftet profilstatus på «Mitt AHA», kontrollert eksport/restore og eksplisitt brukerhandling. Ikke opprett ekstra Supabase-prosjekter eller gjenaktiver Azure.

### Port C.1 – Hosted AHA DB-03: faktisk skrivebeskyttet audit (18.11.2026)

Kjørt mot **kun** AHA Supabase-prosjekt `wshmybqyksrwkawqleiz` med eksisterende katalog-SQL i `supabase/audits/aha_legacy_readonly_preflight.sql` (kun SELECT, ingen persondata). **8/13** forventede tabeller er `POLICY_PREFLIGHT_OK`: `aha_profiles`, `aha_source_events`, `aha_notes`, `aha_gallery_items`, `aha_feed_posts`, `aha_insta_posts`, `aha_imports`, `aha_insight_embeddings`. **5/13** er `MISSING_TABLE`: `aha_insight_chambers`, `aha_insta_profiles`, `aha_insta_likes`, `aha_insta_comments`, `aha_insta_follows`. De manglende tabellene må vurderes opp mot `aha_social`-modellen i draft PR #1035 før eventuell ny migrasjon; ingen automatisk opprettelse. Feed/Insta-posttabellene hadde null rader ved kontrollen.

Katalogen viser eierbaserte SELECT/INSERT/UPDATE-policyer, aktiv RLS og `authenticated`-grants for de eksisterende Feed/Insta-tabellene. Dette er **ikke** en tobruker Data API-test, faktisk sikkerhetsbevis for alle funksjoner eller godkjent backup/restore. Ingen `storage.buckets` er opprettet, og sikker Insta-bildelagring mangler.

Supabase Security Advisors melder vurderingspunkter: to `public` SECURITY DEFINER-RPC-er tilgjengelige for `authenticated` (`aha_open_social_meet_chat`, `aha_report_direct_chat`), `aha_match_insights` med muterbar search_path, `vector`-utvidelse i `public`, tre interne `aha_friend_private`-tabeller med RLS uten egne policyer og deaktivert lekket-passordbeskyttelse. Ingen grant eller funksjon endres uten vurdering av tilsiktede rettigheter.

**Sperrer videre:** to godkjente testkontoer må bevise isolasjon via faktisk Auth/Data API, manuell gjenopprettbar backup må være kontrollert, og eksplisitt samtykke per post samt kontoseparat lokal cache må finnes før data skrives. Hold `enableDatabaseSync` av, behold Cloudflare-pakkesperren, og ikke aktiver offentlig sosial publisering. AHA Staging Supabase er pauset og skal ikke gjenopprettes automatisk. Endringer føres bare i felles databaseregister når status er vedtatt.

### iPad-alternativ for AHA DB-03 – kun klargjort, alltid avslått som standard (19.11.2026)

Brukeren har **bare iPad**, ikke PC/Mac. Vi skal derfor ikke gjøre en lokal PC nødvendig for drift av AHA. Supabase Free har ikke automatisk daglig databasebackup. Supabases offisielle [automatisert-backup-eksempel med GitHub Actions](https://supabase.com/docs/guides/deployment/ci/backups) gir en mulig kjøreflate uten PC, men AHA-repositoriet er **offentlig**, og arbeidsflytartefakter kan være tilgjengelige for lesere. Derfor gjelder strengere sikkerhetsgrenser:

- [`.github/workflows/aha-db03-encrypted-backup-manual.yml`](../.github/workflows/aha-db03-encrypted-backup-manual.yml) er **bare en forhåndsklargjort, manuelt startbar** GitHub Action. Det finnes ingen `push`, `pull_request`, `schedule` eller bakgrunnseksport. Jobben avvises hvis ref ikke er `main`, bruker ikke har markert `confirm_export`, eller eierens egen repository-variable `AHA_DB03_BACKUP_ENABLED` ikke er `yes`. Den skal **ikke aktiveres nå**, og ingen produksjonsdump er kjørt.
- Et framtidig godkjent løp trenger en beskyttet GitHub Environment `aha-db03-backup`, environment-secret `AHA_DB03_DATABASE_URL` (AHA DB-03 **session pooler** port 5432 fra Supabase Dashboard Connect, **ikke** databasepassord i chat eller tekstfil), og variable `AHA_DB03_AGE_RECIPIENT` (offentlig `age1...`-nøkkel). **Privat age-identitet må opprettes og oppbevares bare på brukerens iPad i trygg filoppbevaring, aldri i GitHub, nettleser-URL, chatbot, action input eller logger.** En iPad-kompatibel Linux-app som iSH kan installere age/age-keygen ved behov, men det er ikke et krav brukeren må oppfylle før vi har valgt backupmodell.
- [`scripts/aha-db03-backup-github.sh`](../scripts/aha-db03-backup-github.sh) kontrollerer prosjektreferanse, avviser transaksjonspooler, feil oppsett og andre grener; PostgreSQL 17 kjøres i ephemer GitHub-runner. `pg_dump`-byte-strømmen går direkte gjennom `age`, uten ukryptert dumpfil på disk. Feildiagnostikk med mulige private data vises ikke i logg. **Bare `.dump.age` og et innholdsfritt manifest** kan lastes opp som Actions-artifakt, med sju dagers levetid. En som får tak i den private dekrypteringsnøkkelen vil kunne lese hele eksporten, også mulige Auth-data. GitHub er fortsatt en ekstra databehandler; aktiv eksport krever uttrykkelig beslutning fra eieren.
- Manifestet er alltid `restore_tested:false` og `NOT_APPROVED_FOR_WRITES`, fordi verken arkivlesbarhet, globale roller/grants, Vault-nøkler, Storage-filinnhold eller isolert restore er bevist. GitHub Action er **ikke i seg selv gjenopprettbar backup**, og bare en fungerende kryptert eksport betyr ikke at Feed-synk kan aktiveres. En senere, separat restore-plan må verifisere kopi i isolert miljø før databaseendringer.
- Alternativ for ren iPad-bruk er **Supabase Pro med administrerte automatiske backuper**; dette har en løpende kostnad, krever eksplisitt samtykke og garanterer heller ikke at browserens `localStorage`-poster blir med. Ingen planoppgradering, offentlig publisering eller backend-migrasjon er autorisert av dette dokumentet.

Syntetisk test `tests/aha-db03-backup-github-manual.test.cjs` bruker falsk database og falsk krypterer og kontrollerer at jobben er manuelt sperret, at feil prosjekt og manglende bekreftelse avvises, og at bare krypterte filnavn inkluderes i backup-artefakten. **Den tester ikke den faktiske `age`-krypteringen eller ekte Supabase-datakopi.**

### Port C.2 – neste kontroll: privat databasebackup uten nye tjenester

**Avklart 18.11.2026:** AHA DB-03 bruker Supabase Free. Supabase tar ikke automatisk daglige backuper på Free; prosjektets aktive status og en lokal AHA JSON-eksport er **ikke** gjenopprettbar serverbackup. Supabase anbefaler manuell `db dump` og oppbevaring utenfor tjenesten. Prosedyren nedenfor er for en **betrodd lokal datamaskin**, ikke for iPad-nettleseren og **ikke** for GitHub Actions.

1. Før du gjør endringer: eksporter lokal AHA via `privacy.html` fra **hver opprinnelse/enhet** med data; lokal eksport inneholder ikke Supabase-tabeller. Ikke nullstill Safari.
2. På en betrodd PC/Mac med Supabase CLI og Docker: hent DB-03-tilkobling via AHA Dashboard **Connect**. Hold tilkoblingsstrengen som hemmelig miljøvariabel `AHA_DB_URL` i terminalen, aldri i GitHub, skjermbilder, chat, PR eller logger.
3. Følg Supabases dokumenterte CLI-dump (utført **lokalt**, uten automatiske Actions-artifacts):
   ```sh
   supabase db dump --db-url "$AHA_DB_URL" -f roles.sql --role-only
   supabase db dump --db-url "$AHA_DB_URL" -f schema.sql
   supabase db dump --db-url "$AHA_DB_URL" -f data.sql --use-copy --data-only
   ```
4. **Kontroller dekning før godkjenning:** det må være med alle nødvendige AHA-skjema, tabeller, rader, policyer, funksjoner og relevante Auth-data. Supabase CLI kan filtrere administrerte skjemaer; en vellykket dumpfil alene er ikke bevis på komplett backup. Storage-objekter krever separat sikring (ingen buckets ved kontrollen 18.11). Ikke glem lokale browser-data som aldri kom til databasen.
5. Oppbevar filene **privat og kryptert** utenfor GitHub. Verifiser at filene faktisk finnes og kan leses. Gjenopprett bare i et **isolert lokalt testmiljø**; kontroller tabellantall, radtall, RLS og innloggingstilhørende data. Ikke gjenopprett over DB-03 eller opprett betalt Supabase-staging.
6. Registrer kun aggregert godkjenningsstatus i [felles DATABASE_REGISTER](https://github.com/Paradispartiet/Paradispartiet/blob/main/docs/DATABASE_REGISTER.md), **aldri** dumper, persondata, DB-passord eller tokens.

**Ny, sikrere lokal utførelse 19.11 – kode er laget, ikke kjørt på produksjonsdata:** `scripts/aha-db03-backup-encrypted.sh` er et alternativ til de manuelle CLI-kommandoene over. En betrodd PC/Mac må ha **PostgreSQL-klient 17+ (`pg_dump`, `pg_restore`), Node.js, Git og `age`**. Supabase Free har ikke automatisk daglig databasebackup. De vanlige `supabase db dump`-kommandoene **utelater som standard administrerte skjemaer som `auth` og `storage`**; derfor bruker dette alternativet direkte `pg_dump --format=custom` uten standard-skjemafilter. Ingen SQL/data lagres ukryptert på disk: arkivet strømmer rett til `age`-kryptering med brukerens offentlige mottakernøkkel. Verktøyet avviser feil Supabase-prosjekt, PostgreSQL-klient eldre enn 17 og backupmapper inne i et Git-arbeidstre. Verifisering dekrypterer bare i minnet og kontrollerer `pg_restore --list` for `auth.users/identities/sessions`, `public.aha_profiles/feed/insta`, `storage.buckets/objects`, `vault.secrets`, `supabase_migrations.schema_migrations` og `aha_friend_private`-tabeller. En separat manifestfil får `restore_tested: false` og `NOT_APPROVED`. **Arkivlisten beviser ikke lesbare rader eller komplett funksjonell gjenoppretting**.

Kjør bare på en betrodd PC/Mac, **ikke** i nettleser, GitHub Actions, publisert CI eller ChatGPT, og **aldri** legg tilkoblingsstrengen eller private `age`-nøkler i GitHub:

```sh
# Konfigurer privat age-identitet lokalt; dens offentlige age1-...-nøkkel
# settes i AHA_BACKUP_RECIPIENT. Ikke bruk et passord i shellhistorikk.
read -r -s AHA_DB_URL
export AHA_DB_URL
export AHA_BACKUP_RECIPIENT='age1-ERSTATT-MED-DIN-OFFENTLIGE-NOKKEL'
export AHA_BACKUP_IDENTITY="$HOME/.config/age/keys.txt"
bash scripts/aha-db03-backup-encrypted.sh
unset AHA_DB_URL PGDATABASE
```

Dette **kan ikke kjøres av den tilkoblede Supabase-administrasjonskontakten alene**, som ikke har en API-handling for komplett kryptert databaseeksport. Bevis for faktisk backup krever at en autorisert operatør kjører verktøyet med private lokale nøkler. Det må også kontrolleres separat at roller/grants, Storage-filbytes (per kontroll 19.11: **0 buckets**), Vault-nøkler og et isolert restore av Auth, private tabeller og RLS er gjenopprettbare. En lokal AHA JSON-eksport fra hver enhet er fortsatt en **egen** oppgave, siden browserens data ikke ligger i DB-03. Ingen dump må lagres i dette offentlige repositoriet.

**Status nå:** Prosedyren er dokumentert, men **ingen DB-03-dump, privat oppbevaring eller faktisk restore er utført eller verifisert**. Derfor består ikke backup-porten, og sky-skriving/sosial publisering skal være avslått.

Supabase-kilder: [Database Backups](https://supabase.com/docs/guides/platform/backups), [CLI backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Supabase DB dump](https://supabase.com/docs/reference/cli/supabase-db-dump).

### Port B.3 – sperr også appinnhold fra Supabase Data API (17.11)

**Årsak:** Sperren i #1049 hindrer automatisk `aha_profiles`-upsert ved innlogging, men `js/ahaFeed.js` forsøker fremdeles å kalle `AHARepository.saveFeedPost` når brukeren legger til et innlegg. `js/ahaSources.js` kan tilsvarende lagre kilder, og `js/ahaEmbeddings.js` bruker Supabase direkte. Dette er **ikke** tilstrekkelig isolert før AHA-prosjektets live RLS og grants er kontrollert.

**Oppfølgingsretting 18.11 – Feed er nå lokal som standard også på GitHub Pages:** `js/ahaFeed.js` lagrer **nye innlegg og sletting** lokalt uten direkte Supabase-kall fra Feed, selv når `AHARepository` er tilgjengelig og brukeren er logget inn. Automatisk `AHAIngest.ingest` ved post-opprettelse er fjernet: «Send til AHA» må velges eksplisitt før en kildehendelse eller innsikt opprettes. AHAIngest kan utløse egne kilde-, kammer- og embeddingprosesser, og er **ikke** en garanti for rent lokal behandling når brukeren trykker denne knappen. **Oppdatert 18.11:** Automatisk `persistPost` ved Feed-opprettelse/sletting og `pushLocalToDatabase` fra synklesing er nå fjernet. Selv med `window.AHA_CONFIG.feed.enableDatabaseSync === true` er `syncFromDatabase` kun en uttrykkelig utløst, eieravgrenset lesing. Uventede fremmede profiler avvises, og fjernposter lagres ikke i den gamle delte `localStorage`-nøkkelen. Eldre lokale innlegg bevares, men tilordnes aldri automatisk en skyprofil. Sikker, kontoseparat lokal cache og eksplisitt samtykkebasert skriving må utvikles og godkjennes før ekte synk kan aktiveres. Tester med syntetisk repository verifiserer både lokal standard og eksplisitt opt-in. Eksisterende lokale innlegg bevares; det skjer ingen automatisk migrering. Den separate Cloudflare Data API-sperren beholdes som ekstra beskyttelse også om flagget senere settes feil.

Cloudflare-preview-bygget legger derfor nå en egen `js/ahaPreviewDataApiReadOnly.js`-beskyttelse **kun inn i den kopierte `js/ahaDb.js`**, slik at alle moduler som bruker `AHADb.getClient()` deler samme grense:

- Supabase Auth `getUser`, `getSession` og vanlig innlogging kan fortsette, og godkjente Data API `SELECT`-spørringer kan fortsatt lese egen profilrad.
- PostgREST `insert`, `upsert`, `update`, `delete` og alle `rpc`-kall fra denne klienten blir avvist **før nettverksforespørsel** med `AHA_PREVIEW_READ_ONLY`; ingen innholdsrader lastes opp gjennom disse metodene.
- Alternative tilgangsveier `client.schema(...)` og `client.rest` er også sperret for skriving og RPC. En lesespørringsbygger kan ikke gjøres om til en skriveforespørsel ved å overskrive interne `method`/`body`-felter.
- Appens lokale lagring/Feed/Insta-opplevelse kan fortsette, men må **ikke** omtales som sky-synkronisert. En eksplisitt database-lagringshandling vil returnere kontrollert avslag.
- CI tester med falsk Supabase-klient at `Auth` og egenprofil-lesing virker, mens alle skrivemåter og Feed-innleggets repository-metode får avslag uten nettverkskall. Byggekontrollen feiler om sperren mangler fra Cloudflare-distribusjonen.
- Dette påvirker **ikke original** `js/ahaDb.js` på GitHub Pages og oppretter ingen database, Azure-prosess eller betalt tjeneste.

**Begrensning:** Dette er en Data API-sperre for appens `AHADb`-klient, ikke en generell nettverksbrannmur. Direkte HTTP/fetch-kall, Supabase Storage/Edge Functions og eventuelle andre klienter må fortsatt vurderes separat før private data importeres. Viderefør Cloudflare Access og manuell deploy. Ingen live AHA RLS/grants eller backup er bekreftet.

### Port B.2 – forhindre profilskriving ved Auth i Cloudflare-preview (16.11)

**Oppdaget etter de tidligere grønne innloggingstestene:** `js/ahaAuth.js` kaller `ensureProfile()` under statusoppdatering, og den opprinnelige funksjonen gjør `upsert` av `public.aha_profiles` selv for en allerede innlogget bruker. `js/ahaAuthCallback.js` har også en fallback som gjør `upsert` når Supabase-innloggingen fullføres. Det var dermed **ikke korrekt å beskrive hele Auth-flyten som skrivebeskyttet**, selv om den manuelle profilstesten og legacy chamber-synk er skrivebeskyttede/sperret. Eldre preview-innlogging kan allerede ha opprettet eller oppdatert en profilrad; det er **ikke bekreftet** fra hosted AHA DB-03.

Frem til faktisk EchoNet RLS/grants, backup og to-bruker Data API-test er verifisert, endrer Cloudflare-bygget **bare kopier** av `js/ahaAuth.js` og `js/ahaAuthCallback.js`:

- `ensureProfile()` returnerer en eksisterende **lesebasert** `loadProfile()`-respons uten `upsert`.
- `saveProfileName()` gir eksplisitt `preview_read_only` i stedet for å lagre navn. Dette er en midlertidig preview-grense; profilnavn skal ikke fremstå som lagret.
- Auth-callback bruker `AHAAuth.loadProfile(session.user)`; manglende `AHAAuth` fører til fail-closed, **aldri** direkte fallback-`upsert`.
- Supabase PKCE, sesjonsopprettelse/-fornyelse og vanlig innlogging kan fortsatt fungere; dette er **ikke** databaseprofil-skriving.
- CI kontrollerer markørene i det faktisk bygde previewet, og en separat Node-test simulerer innlogging med falskt Supabase-clientobjekt og feiler ved profil-`upsert`.
- De opprinnelige Auth- og callbackfilene på GitHub Pages er **uendret**; denne sperren gjelder bare neste **manuelle** Cloudflare-preview-deploy. Cloudflare-versjonen som allerede er publisert har ikke nødvendigvis sperren før den blir publisert på nytt.

**Avgrensning:** Denne sperren retter kjente **Auth-utløste profilskrivinger**, ikke en generell nettverksbrannmur eller godkjenning av andre appmodulers manuelle/sosiale skriveruter. Ingen automatisk innholdsimport/synk eller Azure oppheves. Ikke bruk ekte privat datamigrering før hosted AHA DB-03 er kontrollert.

### Port B.1 – lesebasert kontosjekk på «Mitt AHA» (16.11)

Bruker har bekreftet at den nye Cloudflare Supabase-innloggingen fungerer, men «Mitt AHA» viste tidligere bare **lokale AHA-objekter** og en fast tekst som kunne misforstås som innloggingsstatus. `profile.html` har nå en **egen og eksplisitt lesebasert kontosjekk**:

1. Åpne `profile.html` på Cloudflare-preview og velg «Kontroller Supabase-konto». Ingen automatisk **Supabase Auth- eller databasespørring** utløses ved sidelasting; siden laster likevel Supabase SDK fra CDN.
2. `js/ahaProfileSupabaseStatus.js` godtar **kun AHA-prosjektet** `wshmybqyksrwkawqleiz`, verifiserer innlogget bruker med `auth.getUser()` og ber om **kun id-feltet i vedkommendes egen rad** i `public.aha_profiles`.
3. Teksten skiller mellom ingen aktiv sesjon, verifisert sesjon med funnet profilrad, manglende/usynlig profilrad og feil ved tabell/RLS. Den viser ingen e-post, UUID, tokens eller rå serverfeil.
4. Sjekken gjør **ingen** `upsert` / `insert` / `update` / `delete`, laster ikke opp lokale data og aktiverer ingen legacy- eller canonical-sync.
5. **Begrensning:** En egen profilrad som er lesbar er **ikke** et fullstendig bevis på isolasjon mellom to brukere, kapasitet, restore eller pålitelig cloud sync. Live-kontroll av RLS og schema i AHA-kontoen må fremdeles gjennomføres før ekte persondata flyttes.
6. Kontrollen er verifisert med isolert Node-test (`tests/aha-profile-supabase-status-readonly.test.cjs`), men gir **ikke** live-resultat før bruker trykker knappen på publisert Cloudflare-preview.

Dette er en funksjon på **den eksisterende profilstaten**, ikke et nytt databaseregister eller en ny produksjonsdatabase. Oppdater bare [felles databaseregister](https://github.com/Paradispartiet/Paradispartiet/blob/main/docs/DATABASE_REGISTER.md) for nye bekreftede databasefakta.

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
