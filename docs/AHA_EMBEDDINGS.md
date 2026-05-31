# AHA Embeddings + AI Agent

Semantisk lag for innsiktsmotoren + svarende AHA-agent. Hver insight får en vektor som
representerer betydningen av teksten, lagret i Supabase pgvector. Det
gir oss tre nye ting:

1. **Semantisk søk** – "hvilke insights ligner på denne teksten?"
2. **Bedre clustering på sikt** – brukes som signal i konsept-graf
   og lignende analyser når det er nok data.
3. **Cross-insight similarity** – "hvilke andre insights ligner på
   denne?" uten å være avhengig av delt vokabular.
4. **AHA-agent chat** – respons basert på AHA-state + lignende innsikter.

## Komponenter

```text
server.js                          – Express-backend som kaller Voyage + OpenAI
ahaEmbeddings.js                   – klient (browser)
supabase/embeddings.sql            – pgvector-tabell + RPC
docs/AHA_EMBEDDINGS.md             – dette dokumentet
```

## Avhengigheter

Backend krever:

- Node 20+
- Pakker som ligger i `package.json` (`express`, `cors`, `openai`)
- Voyage AI-konto med API-nøkkel (https://www.voyageai.com)

Klient krever:

- Innlogget Supabase-bruker (auth.uid()) – embeddings lagres per profil
- pgvector-extension aktivert i Supabase (`embeddings.sql` slår den på)

## Miljøvariabler (server)

```sh
VOYAGE_API_KEY=...                   # Påkrevd
OPENAI_API_KEY=...                   # Påkrevd for /chat
VOYAGE_MODEL=voyage-multilingual-2   # Default; 1024 dim, multilingual
OPENAI_MODEL=gpt-4.1-mini            # Default for chat
PORT=3030                            # Default
ALLOWED_ORIGINS=https://paradispartiet.github.io,http://localhost:3000
```

`VOYAGE_MODEL` kan byttes til en annen Voyage-modell (f.eks.
`voyage-3` eller `voyage-large-2-instruct`) hvis du vil eksperimentere,
men da må også `vector(1024)` i `embeddings.sql` byttes til riktig
dimensjon, og eksisterende rader må re-genereres.

## Deploy backend (anbefalt: Render)

GitHub Pages kjører ikke Node, så `server.js` må deployes til en
egen host. Den enkleste og tryggeste veien er **Render** — gratis
tier, auto-deploy fra GitHub, env vars som secrets, ingen kode-
omskriving.

Repoen inkluderer en `render.yaml` Blueprint:

1. Logg inn på [render.com](https://render.com) med GitHub-kontoen.
2. **New +** → **Blueprint** → velg `Paradispartiet/AHA-EchoNet`.
3. Render leser `render.yaml`, oppretter tjenesten `aha-agent`, og
   spør om `VOYAGE_API_KEY` og `OPENAI_API_KEY` (markert som secrets).
   Lim inn nøklene — de lagres hos Render og blir aldri skrevet til git.
4. Etter første deploy får du en URL som
   `https://aha-agent-xyz.onrender.com`.
5. Verifiser:
   ```sh
   curl https://aha-agent-xyz.onrender.com/api/aha-agent/health
   # { "ok": true, "service": "aha-agent", "embed_model": "voyage-multilingual-2", "has_key": true, ... }
   ```
6. Sett klienten til å peke på den URL-en. Enten ved å oppdatere
   `ahaConfig.js`:
   ```js
   window.AHA_AGENT_API = "https://aha-agent-xyz.onrender.com/api/aha-agent";
   ```
   eller (anbefalt for testing) lag en lokal `ahaConfig.local.js`:
   ```js
   window.AHA_AGENT_API = "https://aha-agent-xyz.onrender.com/api/aha-agent";
   ```

Render-gratis-tier sover etter ~15 min inaktivitet. Første kall
etter sleep tar ~30 sek (cold start). Det er greit for personlig
bruk; ved aktiv testing kan du oppgradere til betalt for alltid-på.

## Alternativ: Supabase Edge Function

Hvis du vil holde alt i Supabase kan server.js skrives om til en Deno-
basert Edge Function. Krever omskriving av imports og fetch-stilen,
men gir én plattform å forholde seg til. Ikke gjort i dette repoet —
spør hvis du vil ha hjelp med det.

## Kjør backend lokalt (utvikling)

```sh
npm install
VOYAGE_API_KEY=... npm start
# server starter på :3030
curl -s http://localhost:3030/api/aha-agent/health
```

For lokal utvikling: sett `window.AHA_AGENT_API = "http://localhost:3030/api/aha-agent"`
i `ahaConfig.local.js`.

`sw.js` lar `/api/aha-agent/*` gå rett til nettverket uten cache.

## Endepunkter

- `GET /api/aha-agent/health` – health + embedding-konfig.
- `POST /api/aha-agent/embed` – semantisk minne/embeddings (Voyage).
- `POST /api/aha-agent/chat` – svarende AHA-agent (OpenAI Responses API).

`VOYAGE_API_KEY` brukes kun for `/embed`, `OPENAI_API_KEY` brukes kun
for `/chat`. Ingen nøkler skal ligge i frontend.

## Sett opp pgvector

I Supabase SQL Editor:

```sql
-- Kjør én gang etter schema.sql + policies.sql
\i supabase/embeddings.sql
```

(Eller bare lim inn innholdet og kjør.) Den oppretter
`aha_insight_embeddings`, IVFFlat-indeks, RLS-policyer, og RPC-en
`aha_match_insights`.

## Klient-API

Eksponert som `window.AHAEmbeddings`:

```js
// Embed ett insight og lagre vektoren i Supabase
await AHAEmbeddings.embedAndStore(insight);

// Bulk: embed alt i kammeret som ennå ikke har vektor
await AHAEmbeddings.embedAllPending(chamber, {
  batchSize: 16,
  onProgress: ({ embedded, errors, total }) => {
    console.log(`Progress: ${embedded}/${total} (errors: ${errors})`);
  }
});

// Semantisk søk fra fritekst
const r = await AHAEmbeddings.findSimilarToText("klasse og makt", {
  limit: 10,
  threshold: 0.6,
  subject_id: "sub_laring",   // optional
  theme_id: "arbeid"          // optional
});
// r.matches => [{ id, subject_id, theme_id, summary, similarity, created_at }]

// "Hvilke andre insights ligner på denne?"
const sim = await AHAEmbeddings.findSimilarToInsight(insight.id, { limit: 5 });
```

## Automatisk berikelse på ingest

`ahaIngest.js` fyrer `AHAEmbeddings.embedAndStore(insight)` som fire-
and-forget etter at hver nye signal er lagret i kammeret. Hovedflyten
venter aldri på dette: hvis backend er nede eller brukeren ikke er
logget inn, går alt videre uten feil. Når embeddingen faktisk lander,
sendes `aha:embedding-stored` så UI-en kan oppdatere seg.

## Suggestion-only merge events

Etter at en ny insight har fått lagret embedding, kan ingest-laget
foreslå at insighten ligner nok på en eksisterende insight til at de
*kan* være samme tanke. Dette er bevisst kun et forslag — det muterer
ingenting og lager ikke `merged_into`-pekere.

Forutsetninger for at suggestion fyres:

1. Lexical-laget i `addSignalToChamberWithMeta` returnerte
   `action: "created"` (en faktisk ny insight). Hvis lexical allerede
   reinforced en eksisterende insight, hopper embedding-laget over.
2. `AHAEmbeddings.findMergeCandidate(insight, chamber)` finner en
   kandidat i samme `subject_id + theme_id`, som ikke har
   `merged_into`, og hvor cosine-similaritet ≥ `suggestThreshold`
   (default 0.70 — ikke lås den enda, dette er en kalibreringsperiode).

Når begge er oppfylt, fyres et CustomEvent på `window`:

```js
window.addEventListener("aha:merge-suggested", (e) => {
  const {
    source_insight_id,   // den nye insighten
    source_summary,      // dens summary (eller title som fallback)
    candidate,           // hele kandidat-insight-objektet fra chamber
    similarity,          // cosine i [-1, 1]
    threshold            // terskelen som ble brukt
  } = e.detail;
  console.log("merge suggestion:", source_insight_id, "->", candidate.id, similarity);
});
```

Samme info logges også som `console.info("[aha:merge-suggested] ...")`
så du ser forslag mens du jobber i devtools uten å sette opp listener.

**Dette er suggestion-only.** Det finnes ingen `confirmMerge`-funksjon,
ingen UI som spør brukeren, og ingen auto-merge. Eventet er ment som
fundament for senere arbeid: når terskelen er kalibrert med
`calibrateMergeThresholdsForChamber`, kan vi bygge UI som viser
forslagene og lar brukeren bekrefte. Inntil videre er målet bare å
samle observasjoner uten å mutere chamber.

`ingest()` returnerer også `{ meta }` med
`{ action: "created" | "reinforced", insight_id, lexical_sim }` slik at
kallere kan se hva lexical-laget bestemte uten å lytte på events.

## Felter i Supabase-tabellen

| kolonne          | type             | beskrivelse                              |
| ---------------- | ---------------- | ---------------------------------------- |
| `id`             | text PK          | matcher `insight.id` i kammeret          |
| `profile_id`     | uuid             | `auth.uid()` for eieren                  |
| `subject_id`     | text             | fra insight                              |
| `theme_id`       | text             | fra insight                              |
| `summary`        | text             | trunkert til 4000 tegn                   |
| `embedding`      | vector(1024)     | Voyage-vektor                            |
| `model`          | text             | f.eks. `voyage-multilingual-2`           |
| `created_at`     | timestamptz      |                                          |
| `updated_at`     | timestamptz      |                                          |

## Kost-estimat

`voyage-multilingual-2` er pr. 2025 priset rundt $0.06 per 1M
tokens. En typisk insight-summary ligger på 50–200 tokens, så 1000
insights ≈ 100k tokens ≈ $0.006. Bulk-embedding av et helt korpus er
i praksis gratis i denne størrelsesordenen.

## Verifiser flyten (browser-konsoll)

Når backend er deployet, migrasjonen er kjørt, og du er innlogget i
AHA-EchoNet, åpne devtools-konsollen og kjør disse i rekkefølge:

```js
// 1. Sjekk at backend svarer og at Voyage-nøkkelen er satt
await AHAEmbeddings.health()
// → { ok: true, service: "aha-agent", embed_model: "voyage-multilingual-2", has_key: true, ... }

// 2. Sjekk at AHAAuth er logget inn (ellers stoppes lagring av RLS)
await AHAAuth.getProfileId()
// → "uuid-string"  (ikke null)

// 3. Embed ett enkelt insight som test
const chamber = JSON.parse(localStorage.getItem("aha_insight_chamber_v1") || "{\"insights\":[]}");
const first = chamber.insights[0];
console.log("test insight:", first?.id, first?.summary?.slice(0, 80));
const r = await AHAEmbeddings.embedAndStore(first);
console.log(r);
// → { ok: true, data: { id, profile_id, embedding: [...], model, ... } }

// 4. Bulk-embed alt som mangler vektor (kan ta litt tid)
const bulk = await AHAEmbeddings.embedAllPending(chamber, {
  onProgress: (p) => console.log("progress:", p)
});
console.log("bulk:", bulk);
// → { ok: true, embedded: N, errors: 0, pending: N }

// 5. Semantisk søk fra fritekst
const matches = await AHAEmbeddings.findSimilarToText("klasse og makt", { limit: 5 });
console.table(matches.matches.map(m => ({
  similarity: m.similarity.toFixed(3),
  theme: m.theme_id,
  summary: m.summary?.slice(0, 80)
})));

// 6. Finn andre insights som ligner på en gitt insight
const similar = await AHAEmbeddings.findSimilarToInsight(first.id, { limit: 5 });
console.table(similar.matches);
```

`AHAEmbeddings.health()` returnerer nå strukturert diagnostikk med `status`,
`configured`, `backendConfigured`, `backendReachable`, `storageAvailable` og
`signedIn`, slik at debug kan skille manglende konfigurasjon fra backend-,
provider- og storage-feil uten å kjøre en faktisk embedding.

Hvis steg 1 feiler med `not_configured`: sjekk at `window.AHA_AGENT_API`
faktisk er satt til en URL (ikke tom streng).
Hvis steg 1 svarer med `missing_provider_key` eller `has_key: false`:
`VOYAGE_API_KEY` mangler i Render-miljøet.

Debug-notis etter PR 35: Hvis `AHAEmbeddings.health()` returnerer omtrent:

```json
{
  "status": "not_signed_in",
  "backendReachable": true,
  "providerConfigured": true,
  "storageAvailable": true
}
```

så er backend, provider og Supabase/storage klare, men
`AHAAuth.getProfileId()` returnerer ikke aktiv profil. Embeddings skal da
behandles som non-fatal skip, ikke som en chat-blokkerende feil. Se
`docs/aha-embeddings-profile-auth.md` for kildekartlegging av
AHAAuth/profileId-flyten.

Hvis steg 3 feiler med `storage_unavailable`, `not_signed_in` eller
`storage_error`: sjekk Supabase-klient, auth/RLS og at migrasjonen er kjørt
mot samme Supabase-prosjekt som auth.

## Senere steg (ikke gjort ennå)

- Bruke embedding-similarity i `addSignalToChamber` for å avgjøre om
  et signal skal merges inn i en eksisterende insight, i stedet for
  dagens 0.5-text-sim-heuristikk. Krever async-versjon av ingest.
- Lagre frase-vektorer (`buildPhraseIndex`) i samme tabell og bruke
  dem i konsept-graf på meta-laget.
- Re-embed når en insight endrer summary betydelig (tracker kun
  `updated_at` i dag).
   curl -X POST https://aha-agent-xyz.onrender.com/api/aha-agent/chat \
     -H "Content-Type: application/json" \
     -d '{"message":"Hva ser du i innsiktene mine?","ai_state":{"top_insights":[],"concepts":[],"meta_profile":{}},"similar_insights":[]}'
   # { "ok": true, "reply": "...", "model": "...", "response_id": "..." }
