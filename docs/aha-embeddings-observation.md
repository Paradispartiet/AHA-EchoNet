# AHAEmbeddings – observasjon og teknisk kartlegging

## Bakgrunn

Under live smoke-testen etter PR 31/32 ble en separat console-observasjon sett i invalid-URL-scenarioet for Python Engine. Selve Python Engine-smoke-testen var bestått, men console-loggen viste at embeddings-sidekanalen også forsøkte å kjøre og feilet.

Denne PR-en er avgrenset til undersøkelse og dokumentasjon. Den endrer ikke runtime, UI, backend, Python Engine, JavaScript Engine, canonical AHA analysis, fallback-regler, fixtures, regression baseline, localStorage-nøkler, embeddings-logikk eller database-/storage-oppsett.

## Observert console-melding

```text
AHAEmbeddings.embedAndStore feilet Error { }
```

## Kildekartlegging

### Definisjon og eksport

- `ahaEmbeddings.js` definerer klientlaget for embeddings. Kommentarblokken beskriver at modulen snakker med `/api/aha-agent/embed` for å hente vektor og lagrer i Supabase via pgvector.
- `AHAEmbeddings` eksporteres på `window` i `ahaEmbeddings.js` med blant annet `embedAndStore`, `embedAllPending`, `findSimilarToText`, `findSimilarToInsight`, `health`, `isConfigured`, `findMergeCandidate` og `buildEmbeddingText`.
- `embedAndStore(insight)` er definert i `ahaEmbeddings.js`. Funksjonen:
  - krever `insight.id`, ellers returneres `{ ok: false, reason: "missing_id" }`,
  - bygger embedding-tekst via `buildEmbeddingText(insight)`, ellers returneres `{ ok: false, reason: "empty_text" }`,
  - kaller `callEmbed([text], "document")`,
  - leser første embedding fra `result.embeddings[0]`,
  - kaller `storeEmbedding(insight, emb, result.model)`,
  - fanger exceptions og logger `console.warn("AHAEmbeddings.embedAndStore feilet", err)` før den returnerer `{ ok: false, error: err }`.

### Avhengigheter i `ahaEmbeddings.js`

- Backend-endepunkt kommer fra `window.AHA_AGENT_API`. `endpoint()` returnerer `null` hvis verdien mangler, og `isConfigured()` er sann bare når endpoint finnes.
- `callEmbed(texts, inputType)` sender `POST` til `${AHA_AGENT_API}/embed` med JSON-body `{ texts, input_type }`. Hvis `AHA_AGENT_API` mangler, kastes `Error("no_backend: AHA_AGENT_API er ikke konfigurert")`. Hvis HTTP-responsen ikke er ok, kastes `Error("embed_http_<status>: ...")`.
- Supabase-klienten hentes via `global.AHADb?.getClient?.()`. Hvis den mangler returnerer `storeEmbedding` `{ ok: false, reason: "no_supabase" }`.
- Profil-id hentes via `global.AHAAuth.getProfileId()`. Hvis profil mangler returnerer `storeEmbedding` `{ ok: false, reason: "not_signed_in" }`.
- Lagring skjer i tabellen `aha_insight_embeddings` med `upsert(..., { onConflict: "id" })`, feltene `id`, `profile_id`, `subject_id`, `theme_id`, `summary`, `embedding`, `model` og `updated_at`, etterfulgt av `.select().single()`.
- Backend-implementasjonen i `server.js` eksponerer `POST /api/aha-agent/embed`, krever `VOYAGE_API_KEY`, validerer `texts`, kaller Voyage embeddings-endepunktet og returnerer `{ ok, model, dim, embeddings, usage }`.
- Supabase/pgvector-oppsettet er dokumentert i `docs/AHA_EMBEDDINGS.md`, som peker på `supabase/embeddings.sql` for tabell, indeks, RLS-policyer og RPC-en `aha_match_insights`.

### Kallsteder for `embedAndStore`

- `ahaIngest.js` kaller `AHAEmbeddings.embedAndStore(target)` i `enrichWithEmbedding(signal, meta)`.
  - Kallet skjer etter at `AHAIngest.ingest(input)` eller `AHAIngest.ingestWithCandidates(input, candidates)` har laget/oppdatert insight i kammeret og lagret chamber-state.
  - `enrichWithEmbedding` finner `target`-insight enten via `meta.insight_id` eller ved å matche nyeste insight på `subject_id`, `theme_id` og timestamp.
  - Funksjonen stopper tidlig hvis `signal.text` mangler, `AHAEmbeddings.embedAndStore` ikke finnes, eller `AHAEmbeddings.isConfigured()` finnes og returnerer `false`.
  - Etter vellykket embedding fyres `aha:embedding-stored`; hvis insighten var ny kan `findMergeCandidate` brukes til suggestion-only merge-event.
- `ahaChat.js` kaller `AHAEmbeddings.embedAndStore(target)` i `refreshTargetEmbedding(target)` etter en bekreftet merge.
  - Dette er eksplisitt fire-and-forget: kommentaren sier at hovedflyten aldri venter på re-embedding etter merge.
  - Kallet stopper tidlig hvis `AHAEmbeddings` eller `embedAndStore` mangler, eller hvis `isConfigured()` finnes og returnerer `false`.
  - Etter vellykket re-embedding fyres `aha:embedding-refreshed`; ved rejected promise logges `AHAChat: re-embed etter merge feilet`.

### Relatert embedding-bruk uten `embedAndStore`

- `ahaChat.js` bruker `AHAEmbeddings.findSimilarToText(message, { limit: 5, chamber })` i `askAhaAgent(message)` for å sende `similar_insights` til agent-backend. Dette er også beskyttet med `try/catch` og logges som `Klarte ikke hente similar insights` uten å blokkere chat-kallet.
- `docs/AHA_EMBEDDINGS.md` beskriver at `ahaIngest.js` fyrer `AHAEmbeddings.embedAndStore(insight)` som fire-and-forget etter lagring av nye signaler i kammeret, og at hovedflyten ikke venter på dette.

## Foreløpig flyt

Faktisk flyt for AHA Chat-melding basert på kildekoden:

```text
AHA Chat brukerinput
→ ahaChat.js / ingestUserMessageWithCandidates(messageText, candidates)
→ AHAIngest.ingestWithCandidates(payload, chunks)
→ AHAIngest.ingest(baseInput med skip_insight: true) logger source event
→ InsightsEngine.createSignalFromMessage(...)
→ InsightsEngine.addSignalToChamberWithMeta(...) eller addSignalToChamber(...)
→ saveChamber(chamber)
→ enrichWithEmbedding(signal, meta) som fire-and-forget sidekanal
→ AHAEmbeddings.embedAndStore(target insight)
→ buildEmbeddingText(insight)
→ POST `${window.AHA_AGENT_API}/embed`
→ server.js / POST /api/aha-agent/embed
→ Voyage embeddings-provider via VOYAGE_API_KEY
→ storeEmbedding(insight, embedding, model)
→ Supabase-tabellen `aha_insight_embeddings`
→ eventuell console warning og `{ ok: false, error }` hvis embed-kall eller lagring feiler
```

I tillegg finnes en egen re-embedding-sidekanal etter bekreftet merge:

```text
AHA Chat merge-handling
→ ahaChat.js / refreshTargetEmbedding(target)
→ AHAEmbeddings.embedAndStore(target)
→ samme embed-/storage-løp som over
→ aha:embedding-refreshed ved suksess
```

## Foreløpig vurdering

Feilen virker ikke-blokkende for AHA Chat og canonical analysis basert på kildekoden:

- `ahaIngest.js` starter embedding-berikelse etter at source event, signal, chamber-oppdatering og `aha:ingested` allerede er håndtert.
- `ahaIngest.js` bruker `.catch(...)` rundt `enrichWithEmbedding(...)`, og `embedAndStore` returnerer `{ ok: false, error }` etter egen `console.warn` i stedet for å kaste videre.
- `ahaChat.js` beskriver re-embedding etter merge som fire-and-forget, og kommentaren sier at hovedflyten aldri venter på dette.
- `docs/AHA_EMBEDDINGS.md` beskriver samme intensjon: embedding etter ingest er fire-and-forget, og hovedflyten venter aldri på det.

Foreløpig påvirkningsvurdering:

- AHA Chat-svar: ser ikke ut til å bli blokkert av `embedAndStore`-feilen. Chat kan fortsatt sende melding, kjøre analysis/agent-flow og vise svar.
- Python Engine-valg: ser ikke ut til å bli påvirket. Python Engine-valg ligger i egen engine-/client-flyt og er ikke avhengig av `embedAndStore`.
- JavaScript fallback: ser ikke ut til å bli påvirket. Fallback-reason håndteres av AHA Engine-flyten, ikke embeddings-lagringen.
- Canonical analysis: ser ikke ut til å bli endret av embeddings-sidekanalen. `embedAndStore` tar et ferdig insight-objekt og prøver å lage/lagre vektor.
- Lagring av innsikter/minne: selve kammer-/insight-lagringen skjer før embedding-sidekanalen. Feilen kan derimot bety at embeddings/minne/similarity-laget ikke får lagret eller oppdatert vektor for relevant insight.
- Fremtidig/valgfri embeddings-sidekanal: dette er det mest sannsynlige påvirkningsområdet. Semantisk søk, merge-suggestions og senere memory-funksjonalitet kan få mindre eller manglende data hvis embeddings ikke lagres.

## Hva feilen ikke påvirket i live-testen

Basert på PR 32-live-smoke-testen:

- Python Engine staging ble brukt med `latestSource: "python"` for tre representative meldinger.
- Fail-closed uten eksplisitt URL ga `javascript_fallback` / `requires_explicit_url`.
- Invalid URL ga `javascript_fallback` / `network_error`.
- Reset gikk tilbake til JavaScript/default-flow.
- Python Engine smoke-testen ble ikke blokkert av `AHAEmbeddings.embedAndStore feilet Error { }`.
- `AHAPythonEngineSmokeTest` viste korrekt status for invalid-URL-scenarioet.

Feilen bør likevel følges opp, fordi embeddings/minne kan være relevant for senere AHA-funksjonalitet, blant annet semantisk søk og merge-suggestions.

## Mulige årsakskategorier

Dette er foreløpige observasjoner/hypoteser basert på kildekoden, ikke bekreftede konklusjoner:

- Manglende eller utilgjengelig embeddings-backend: `callEmbed` kaster hvis `AHA_AGENT_API` mangler eller hvis `${AHA_AGENT_API}/embed` returnerer non-2xx.
- Network/CORS/hosting-feil: `callEmbed` bruker browser `fetch` mot configured backend. Fetch-feil kan ende i `catch` og logges som observert console warning.
- Manglende embeddings-provider/API-nøkkel på backend: `server.js` returnerer 503 med `missing_api_key` hvis `VOYAGE_API_KEY` mangler.
- Upstream provider-feil: `server.js` returnerer 502 med `upstream_error` hvis Voyage-kallet feiler.
- Manglende Supabase-klient eller innlogging: `storeEmbedding` returnerer `no_supabase` eller `not_signed_in`. Dette skal normalt ikke kaste, men kan forklare manglende lagring uten hard runtime-feil.
- Manglende database-/pgvector-oppsett eller RLS-/RPC-problem: `storeEmbedding` returnerer `{ ok: false, error }` hvis Supabase `upsert` feiler. Dette logger ikke nødvendigvis den samme `AHAEmbeddings.embedAndStore feilet`-meldingen, men kan forklare at embedding ikke lagres.
- Ugyldig payload eller tom embedding-respons: `embedAndStore` returnerer `missing_id`, `empty_text` eller `no_embedding` uten å kaste. Dette virker mindre sannsynlig for akkurat console-meldingen, men er relevante kategorier for embedding-feil.
- Funksjonen kalles når embeddings er konfigurert med endpoint, men endpoint/provider/storage ikke faktisk er klar. Kallstedene sjekker `isConfigured()`, men den sjekken verifiserer bare at `AHA_AGENT_API` finnes, ikke at `/embed`, Voyage-nøkkel, Supabase-tabell eller RLS er operative.
- Feil håndteres som ikke-blokkende sideeffekt. Dette er både dokumentert og implementert, og forklarer hvorfor Python Engine-smoke-testen kunne bestå samtidig som console warning dukket opp.

## PR 35 – profileId og innlogging

PR 35 følger opp PR 34-diagnostikken i `docs/aha-embeddings-profile-auth.md`. Live-statusen ble isolert til `status: "not_signed_in"` og `AHAAuth.getProfileId()` → `null`, samtidig som backend, provider og storage var tilgjengelige. Det betyr at embeddings-lagring manglet aktiv brukerprofil, ikke at Python Engine, canonical analysis, AHA Chat-hovedflyt, provider, backend eller Supabase-klient feilet. `not_signed_in` skal behandles som non-fatal skip for embeddings.

## PR 36 – live auth/profileId-test

PR 36 dokumenterer live auth/profileId-testen som bekreftet at
`not_signed_in` gikk over til `configured` etter innlogging. Se
`docs/aha-embeddings-profile-auth.md`. Dette er fortsatt dokumentasjon av
forutsetninger for embedding-lagring, ikke dokumentasjon av at en faktisk
embedding-rad er skrevet til `aha_insight_embeddings`.

## Anbefalt neste PR

Foreslått oppfølging, uten å implementere det i denne PR-en:

**PR 34: Gjør AHAEmbeddings-status eksplisitt og ikke-støyende i debug/diagnostikk**

Mulig innhold for en senere PR:

- vise eksplisitt embeddings-status basert på `AHAEmbeddings.health()` i et diagnostikk-/debugområde,
- skille tydelig mellom `not_configured`, backend unreachable, provider missing key, Supabase/storage-feil og ikke-innlogget bruker,
- vurdere en trygg konfigurasjonssjekk før `embedAndStore`-kall som ikke endrer hovedflyt eller skjuler reelle feil,
- beholde fire-and-forget og fail-soft-egenskapene slik at chat/analysis fortsatt ikke blokkeres av embeddings.

Denne PR-en implementerer ikke PR 34, fikser ikke embedding-feilen og endrer ikke runtime-adferd.

## PR 34 – tydeligere embeddings-status

PR 34 gjør embeddings-status eksplisitt i debug/diagnostikk uten å endre AHA Chat-hovedflyt eller gjøre embeddings blokkende.

- `AHAEmbeddings.health()` returnerer nå en strukturert status som skiller mellom `not_configured`, `configured`, `backend_unreachable`, `missing_provider_key`, storage-tilstand og innloggingsstatus.
- `AHAEmbeddings.embedAndStore()` returnerer mer presise `reason`-verdier for skip og feil, blant annet `not_configured`, `backend_unreachable`, `missing_provider_key`, `provider_error`, `storage_unavailable`, `not_signed_in`, `storage_error` og `unknown_error`.
- Console-meldingen skiller mellom `skipped` for forventede non-fatal tilstander og `failed` for backend/provider/storage-feil, og logger bare kort status/reason uten embedding-vektor, payload eller API-nøkler.
- Endringen fikser ikke provider-, backend- eller databasekonfigurasjon. Den gjør observasjonen diagnostiserbar og bevarer embeddings som en best-effort sidekanal.
