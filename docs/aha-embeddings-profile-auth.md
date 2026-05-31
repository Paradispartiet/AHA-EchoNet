# AHAEmbeddings – profileId og innlogging

## Bakgrunn

PR 33 dokumenterte console-observasjonen `AHAEmbeddings.embedAndStore feilet Error { }` som en separat embeddings-observasjon fra Python Engine live smoke-testen. PR 34 gjorde `AHAEmbeddings.health()` mer eksplisitt, slik at backend-, provider-, storage- og innloggingsstatus kan skilles fra hverandre uten å gjøre embeddings blokkende.

Live-diagnostikk etter PR 34 viste:

```json
{
  "ok": false,
  "status": "not_signed_in",
  "configured": false,
  "backendConfigured": true,
  "backendReachable": true,
  "storageAvailable": true,
  "signedIn": false,
  "reason": "not_signed_in",
  "service": "aha-agent",
  "embed_model": "voyage-multilingual-2",
  "has_key": true,
  "has_openai_key": true,
  "openai_model": "gpt-4.1-mini",
  "has_voyage_key": true,
  "providerConfigured": true
}
```

Deretter returnerte:

```js
AHAAuth.getProfileId().then(profileId => console.log("profileId:", profileId))
// profileId: null
```

Konklusjonen for denne statusen er derfor smal: backend er konfigurert og nåbar, Voyage/OpenAI-providerne er konfigurert, Supabase/storage-klienten finnes, men AHAAuth har ikke en aktiv Supabase-session/user id som kan brukes som `profileId`.

## Kildekartlegging

### AHAAuth

- `ahaAuth.js` definerer `window.AHAAuth` og eksporterer blant annet `getSession`, `getUser`, `getProfileId`, `loadProfile`, `ensureProfile`, `saveProfileName`, `signInWithEmail`, `signInWithProvider`, `signOut`, `renderAuthStatus`, `debugAuthState` og `bindAuthPanel`.
- `ahaAuth.js` henter Supabase-klienten via `global.AHADb?.getClient?.()` i `getClient()`.
- `ahaDb.js` oppretter Supabase browser client med `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true` og `flowType: "pkce"`.
- `getSession()` kaller `client.auth.getSession()` med timeout. Hvis Supabase-klient mangler, hvis Supabase returnerer feil, eller hvis timeout/exception oppstår, returnerer funksjonen `null`.
- `getUser()` returnerer `session?.user || null` basert på `getSession()`.
- `getProfileId()` returnerer `user?.id || null`, cacher verdien i `localStorage`-nøkkelen `aha_profile_id`, og fjerner cachet verdi når profileId mangler.
- `renderAuthStatus()` håndterer callback-parametre, henter bruker, cacher `user.id` ved innlogging, kaller `ensureProfile()`, og fyrer `aha:auth-ready`. Uten bruker setter den auth-status til lokal/ikke innlogget, fjerner `aha_profile_id` og fyrer `aha:auth-ready` med `user: null`.
- `loadProfile(user)` leser `aha_profiles` der `id = user.id`. `ensureProfile()` upserter `aha_profiles.id = user.id`. Dermed er faktisk policy-modell: Supabase auth user id = `aha_profiles.id`, og AHA-rader bruker `profile_id = auth.uid()`.

### Login/profil-flow som allerede finnes

- `ahaAuth.js` har eksisterende login-funksjoner: `signInWithEmail(email)` bruker Supabase OTP/magic link, `signInWithProvider(provider)` bruker Supabase OAuth, og `signOut()` bruker `client.auth.signOut()`.
- `ahaAuth.js` binder eksisterende auth-panel i `bindAuthPanel()`: `#aha-auth-form`, `#aha-auth-email`, `#aha-auth-google`, `#aha-auth-signout` og `#aha-auth-output`. Den lytter også på `client.auth.onAuthStateChange(() => renderAuthStatus())` når Supabase-klienten støtter det.
- `index.html` inneholder login-modal med Google-knapp, e-post/magic-link-form, logg-inn/logg-ut-knapper og profilnavn-modal.
- `ahaDashboard.js` leser auth-state via `window.AHAAuth.getUser()` og `window.AHAAuth.loadProfile(user)`, oppretter manglende profil med `ensureProfile()`, og renderer dashboard-identitet, profileId/status og login/profilnavn-UI.
- `ahaAuthCallback.js` håndterer Supabase callback-siden `auth-callback.html` ved å kalle `client.auth.getSession()` etter PKCE-redirect og sender deretter brukeren tilbake til dashboard.

### Sider som laster AHAAuth og AHAEmbeddings

Følgende HTML-sider laster `ahaAuth.js` og `ahaEmbeddings.js`:

- `chat.html`
- `index.html`
- `gallery.html`
- `insta.html`
- `feed.html`
- `notes.html`

`chat.html` laster i tillegg `ahaChat.js`. Chat-siden viser en profilkort-status basert på `aha:auth-ready` eller cachet `aha_profile_id`, men selve AHA Chat-hovedflyten er ikke gjort avhengig av innlogging. Når ingen profil finnes vises lokal modus / ikke innlogget, og chat kan fortsatt kjøre med localStorage og JavaScript/Python-analyseflyt.

### AHAEmbeddings og profileId

- `ahaEmbeddings.js` definerer `profileId()`, som kun er en tynn wrapper rundt `global.AHAAuth.getProfileId()`. Hvis `AHAAuth.getProfileId` ikke finnes, returnerer wrapperen `null`.
- `health()` kaller `profileId()` og setter `signedIn` til `Boolean(await profileId())`. Når backend og provider er ok, men `signedIn === false`, blir status `not_signed_in`.
- `storeEmbedding(insight, embedding, model)` henter Supabase-klienten, kaller `profileId()`, og returnerer `{ ok: false, reason: "not_signed_in" }` før upsert hvis profileId mangler.
- Når profileId finnes, upserter `storeEmbedding()` til `aha_insight_embeddings` med feltene `id`, `profile_id`, `subject_id`, `theme_id`, `summary`, `embedding`, `model` og `updated_at`.
- `embedAndStore(insight)` kaller `storeEmbedding()` etter vellykket backend-embedding og normaliserer/returnerer resultatet. `not_signed_in` ligger i `SKIP_REASONS`, så loggen klassifiseres som `skipped`, ikke `failed`.
- `embedAllPending()` og `findMergeCandidate()` har samme profileId-gate og returnerer `not_signed_in` uten å skrive data når brukeren ikke er signert inn.

### Database-/RLS-kilder

- `supabase/schema.sql` definerer `aha_profiles.id` som UUID primary key.
- `supabase/README.md` beskriver policy-modellen som `Supabase auth user id = aha_profiles.id` og `profile_id = auth.uid()` for AHA-rader.
- `supabase/embeddings.sql` definerer `aha_insight_embeddings.profile_id` som referanse til `aha_profiles(id)`, oppretter indeks på `profile_id`, og RLS-policyene tillater bare select/insert/update/delete når `profile_id = auth.uid()`.
- RPC-en `aha_match_insights` filtrerer også defensivt på `e.profile_id = auth.uid()`.

## ProfileId-flyt

Faktisk flyt for embeddings-lagring er:

```text
Supabase browser session
→ ahaAuth.js / getSession()
→ ahaAuth.js / getUser()
→ ahaAuth.js / getProfileId()
→ localStorage-cache "aha_profile_id" oppdateres for UI/cache
→ ahaEmbeddings.js / profileId()
→ ahaEmbeddings.js / storeEmbedding()
→ Supabase upsert til aha_insight_embeddings.profile_id
→ RLS sjekker profile_id = auth.uid()
```

`profileId` kommer altså ikke fra en separat guest-profil, ny database, Python Engine, embeddings-backend eller provider. Den faktiske lagringsverdien kommer fra Supabase Auth-sessionens `user.id`. `localStorage`-nøkkelen `aha_profile_id` er en cache/statushjelper som oppdateres av `AHAAuth`, men `AHAAuth.getProfileId()` leser ikke profileId fra localStorage som sann kilde; den spør Supabase-sessionen via `getUser()`.

## Når kan `AHAAuth.getProfileId()` returnere null?

`AHAAuth.getProfileId()` returnerer `null` når `getUser()` ikke finner en Supabase-user. Det kan skje når:

- Supabase ikke er konfigurert eller SDK/client ikke er tilgjengelig, slik at `getSession()` ikke kan hente session.
- Brukeren ikke har logget inn, har logget ut, eller Supabase-sessionen er utløpt/fjernet.
- Auth-callback/PKCE-flowen ikke har fullført eller ikke har gitt en session.
- `client.auth.getSession()` returnerer error eller timeout/exception; `getSession()` logger da warning og returnerer `null`.
- Siden kjører i lokal modus uten aktiv Supabase-auth, selv om localStorage-data og AHA Chat fortsatt fungerer.

Dette forklarer den observerte live-statusen: `AHAAuth.getProfileId()` returnerte `null`, og `AHAEmbeddings.health()` rapporterte derfor `signedIn: false` og `status: "not_signed_in"`.

## Hvorfor embeddings ikke lagres når profileId er null

Embeddings er personlige vektorer for brukerens insights. Tabellen `aha_insight_embeddings` er RLS-beskyttet per brukerprofil, og både tabell-policyene og `aha_match_insights` er bygget rundt `profile_id = auth.uid()`.

Uten aktiv profileId kan klienten ikke vite hvilken bruker vektoren tilhører. Den skal derfor ikke skrive en rad med manglende/feil eier, lage en anonym profil, eller omgå RLS. Riktig oppførsel er å returnere `not_signed_in` som en non-fatal skip-tilstand.

Dette er viktig for AHA Chat: embeddings er en best-effort sidekanal for semantisk minne og similar-insights. Manglende profileId skal ikke stoppe chat-svar, canonical analysis, Python/JavaScript engine-flyt eller chamber/localStorage-hovedflyt.

## Hva som allerede fungerer i den observerte live-statusen

Den observerte `health()`-responsen viser at:

- `backendConfigured: true` – `AHA_AGENT_API` peker på en embeddings-/agent-backend.
- `backendReachable: true` – backendens `/health` svarer.
- `providerConfigured: true`, `has_key: true`, `has_voyage_key: true` – Voyage embeddings-provider er konfigurert.
- `has_openai_key: true`, `openai_model: "gpt-4.1-mini"` – OpenAI chat-provider er konfigurert på backend.
- `storageAvailable: true` – frontend har Supabase/storage-klient.
- `signedIn: false` og `AHAAuth.getProfileId() === null` – feilen er isolert til manglende aktiv Supabase-auth/profileId i browser-sessionen.

## Hva dette ikke betyr

Denne statusen betyr ikke at Python Engine feiler. Den betyr heller ikke at canonical AHA analysis feiler, at AHA Chat-svar skal stoppes, at JavaScript fallback skal endres, at provider/backend mangler, eller at databasen nødvendigvis er feil. Den betyr bare at embeddings-lagring ikke har en aktiv brukerprofil å knytte vektoren til.

## Anbefalt videre arbeid

Ikke implementer dette i PR 35. Mulige smale neste PR-er basert på funnene:

1. **PR 36: Vis/diagnostiser innloggingsstatus for AHAEmbeddings uten å blokkere chat.** Relevant hvis eksisterende auth-flow er riktig, men AHA Chat bør gjøre det tydeligere at embeddings-lagring er skip-et fordi brukeren ikke er signert inn.
2. **PR 36: Dokumenter og koble eksisterende AHAAuth-profilflyt tydeligere til AHA Chat.** Relevant hvis produktbeslutningen er at embeddings skal lagres når brukeren bruker AHA Chat og eksisterende login/profil-flow bare må eksponeres bedre.
3. **PR 36: Definer anonym/guest-policy for AHAEmbeddings og profileId.** Relevant bare hvis systemet bevisst skal støtte anonym semantisk lagring. Det krever en egen policybeslutning og skal ikke løses ved å skrive embeddings uten profileId.

PR 35 bygger ikke login, endrer ikke auth-flow, legger ikke til databaseendringer, endrer ikke provider/backend, endrer ikke Python Engine, endrer ikke canonical analysis, og gjør ikke embeddings blokkende.
