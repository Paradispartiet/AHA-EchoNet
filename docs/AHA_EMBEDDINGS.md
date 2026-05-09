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

## Kjør backend lokalt

```sh
npm install
VOYAGE_API_KEY=... npm start
# server starter på :3030
curl -s http://localhost:3030/api/aha-agent/health
```

`sw.js` lar `/api/aha-agent/*` gå rett til nettverket uten cache, så
klienten kan snakke direkte mot serveren i prod uten ekstra config.

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

## Senere steg (ikke gjort ennå)

- Bruke embedding-similarity i `addSignalToChamber` for å avgjøre om
  et signal skal merges inn i en eksisterende insight, i stedet for
  dagens 0.5-text-sim-heuristikk. Krever async-versjon av ingest.
- Lagre frase-vektorer (`buildPhraseIndex`) i samme tabell og bruke
  dem i konsept-graf på meta-laget.
- Re-embed når en insight endrer summary betydelig (tracker kun
  `updated_at` i dag).
