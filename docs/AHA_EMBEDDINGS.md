# AHA Embeddings

Semantisk lag for innsiktsmotoren. Hver insight får en vektor som
representerer betydningen av teksten, lagret i Supabase pgvector. Det
gir oss tre nye ting:

1. **Semantisk søk** – "hvilke insights ligner på denne teksten?"
2. **Bedre clustering på sikt** – brukes som signal i konsept-graf
   og lignende analyser når det er nok data.
3. **Cross-insight similarity** – "hvilke andre insights ligner på
   denne?" uten å være avhengig av delt vokabular.

## Komponenter

```text
server.js                          – Express-backend som kaller Voyage
ahaEmbeddings.js                   – klient (browser)
supabase/embeddings.sql            – pgvector-tabell + RPC
docs/AHA_EMBEDDINGS.md             – dette dokumentet
```

## Avhengigheter

Backend krever:

- Node 20+
- Pakker som ligger i `package.json` (`express`, `cors`, `openai` er
  igjen for fremtidig bruk men ikke i bruk her)
- Voyage AI-konto med API-nøkkel (https://www.voyageai.com)

Klient krever:

- Innlogget Supabase-bruker (auth.uid()) – embeddings lagres per profil
- pgvector-extension aktivert i Supabase (`embeddings.sql` slår den på)

## Miljøvariabler (server)

```sh
VOYAGE_API_KEY=...                   # Påkrevd
VOYAGE_MODEL=voyage-multilingual-2   # Default; 1024 dim, multilingual
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
   spør om `VOYAGE_API_KEY` (markert som secret). Lim inn nøkkelen —
   den lagres hos Render og blir aldri skrevet til git.
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

Hvis steg 1 feiler med `no_backend`: sjekk at `window.AHA_AGENT_API`
faktisk er satt til en URL (ikke tom streng).
Hvis steg 1 svarer men `has_key: false`: `VOYAGE_API_KEY` mangler i
Render-miljøet.
Hvis steg 3 feiler med RLS-error: migrasjonen er ikke kjørt mot
samme Supabase-prosjekt som auth.

## Senere steg (ikke gjort ennå)

- Bruke embedding-similarity i `addSignalToChamber` for å avgjøre om
  et signal skal merges inn i en eksisterende insight, i stedet for
  dagens 0.5-text-sim-heuristikk. Krever async-versjon av ingest.
- Lagre frase-vektorer (`buildPhraseIndex`) i samme tabell og bruke
  dem i konsept-graf på meta-laget.
- Re-embed når en insight endrer summary betydelig (tracker kun
  `updated_at` i dag).
