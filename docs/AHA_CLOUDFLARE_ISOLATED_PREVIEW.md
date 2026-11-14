# AHA på egen Cloudflare-konto – isolert Pages-test

**Status:** Klargjort i GitHub, **ikke deployet**, ingen produksjonsflytting.

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
- Bygget må inneholde `index.html`, `feed.html`, `insta.html` og kjerneskript/CSS, ellers feiler det.
- Frontend-commit SHA settes på samme `ahaChatInsightPipeline.js`-markør som GitHub Pages.
- Jobben har bare `contents: read`-rettighet til GitHub og kjører kun ved `workflow_dispatch` fra `main`.
- Cloudflare-sekreter må være lagt inn i AHA-miljøet; fravær stopper kjøringen.
- Ingen automatisk deploy på push, merge eller PR.

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
