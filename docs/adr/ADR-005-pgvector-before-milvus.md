# ADR-005: Pgvector brukes før Milvus

- Status: **Accepted**
- Dato: 14. august 2026
- Implementert: Delvis — dagens valgfrie pgvector-lag finnes, men den nye adapter- og produksjonskontrakten er ikke implementert
- Omfang: Backend Foundation v1

## Kontekst

AHA trenger semantisk søk, personlig minne, fagavgrenset retrieval og senere gruppesøk. Repoet har allerede et valgfritt PostgreSQL/pgvector-schema med embeddingtabell og likhetssøk. Den opprinnelige prosjektbeskrivelsen foreslo Milvus for større skala og forskningsanalyse.

Milvus kan være riktig senere, men en separat vektortjeneste gir ekstra drift, tenantfiltrering, backfill, observability og konsistensarbeid. Vektorsøk skal derfor skaleres etter målte behov, ikke teknologiforventning.

## Beslutning

Pgvector er første produksjonsimplementasjon av AHA sitt vektorlager.

All vektorbruk skal ligge bak en versjonert adapterkontrakt:

```ts
interface VectorStore {
  upsert(record: VectorRecord): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: VectorQuery): Promise<VectorMatch[]>;
  health(): Promise<VectorStoreHealth>;
}
```

Første adapter:

```text
PgVectorStore
```

Mulig senere adapter:

```text
MilvusVectorStore
```

## Canonical grense

- PostgreSQLs relasjonelle domeneobjekter er system of record.
- Embeddings er avledede data som kan regenereres.
- Vektorlageret kan ikke være eneste kopi av innsikt, kilde, samtykke eller revisjon.
- Hver vektor skal peke til en stabil canonical objekt-ID og versjon.
- Sletting, erstatning og tilbaketrukket samtykke skal kunne fjerne eller deaktivere avledede vektorer.

## Minimumsmetadata

Et vektorrecord skal minst kunne uttrykke:

- `id`
- canonical `object_id`
- `object_type`
- `object_revision`
- `owner_profile_id` og/eller `workspace_id`
- modellnavn og modellversjon
- embeddingdimensjon
- source/provenance-identitet
- fag-/temafilter der relevant
- aktiv/inaktiv status
- opprettelses- og oppdateringstid

Rå privat tekst skal ikke dupliseres i vektorlageret dersom søket kan gjennomføres med avledet summary og sikker metadatareferanse.

## Retrieval-regler

- Tenantfilter er obligatorisk og skal ikke legges på etter at globale treff er hentet.
- Inaktive, slettede, erstattede, bestridte eller samtykketilbaketrukne objekter skal ikke returneres.
- Personlig minne, arbeidsromminne og offentlig materiale skal søkes som eksplisitte scopes.
- Fag- og run-isolasjon fra dagens AHA-kvalitetskontrakt skal bevares.
- Ukjent scope skal feile lukket.

## Målinger

Pgvector skal instrumenteres for:

- antall aktive vektorer
- p50/p95/p99 søketid
- recall og precision på golden-fixtures
- filterpresisjon og tenantisolasjon
- indekserings- og backfilltid
- lagringsstørrelse
- feilrate
- kostnad
- påvirkning på canonical PostgreSQL-last

## Milvus-port

Milvus kan vurderes dersom målinger dokumenterer ett eller flere av disse forholdene:

- p95-latency overstiger definert budsjett etter rimelig PostgreSQL-tuning
- recall eller hybrid søk er utilstrekkelig
- indeksvedlikehold påvirker canonical database
- gruppe- eller globalt korpus vokser vesentlig utover pgvector-målet
- forskningsprosjekter krever isolerte eller tidsfrosne collections
- multi-vector-, multimodal- eller avansert hybrid retrieval gir klar dokumentert verdi

Milvus skal ikke aktiveres bare fordi det sto i en tidligere teknisk plan.

## Migrering til Milvus

En eventuell overgang skal bruke shadow-strategi:

1. implementer `MilvusVectorStore`
2. backfill fra canonical objekter eller godkjent embeddingarkiv
3. dual-write nye vektorer
4. kjør samme queries mot pgvector og Milvus
5. sammenlign recall, latency, filtersikkerhet og kostnad
6. flytt lesing gradvis bak feature flag
7. behold rollback til pgvector
8. stopp dual-write først etter godkjent stabilitetsperiode

PostgreSQL forblir system of record etter overgangen.

## Konsekvenser

### Positive

- gjenbruk av eksisterende PostgreSQL-kompetanse og schema
- færre driftskomponenter i første flerbrukerversjon
- klar målebasert vei til Milvus
- vektorleverandør kan byttes bak adapter

### Kostnader og risiko

- pgvector kan senere kreve migrering
- tung vektorlast kan konkurrere med canonical database
- adapterkontrakten må være streng nok til å unngå leverandørspesifikk lekkasje
- tenantfilter og sletting må testes på begge adaptere

## Aktiveringsport

ADR-en kan markeres fullt `Implemented` når:

- `VectorStore`-kontrakten og `PgVectorStore` finnes
- embeddingjobber er idempotente
- tenant-, fag- og minnestatusfiltre er testet
- sletting og samtykketilbaketrekking fjerner aktive treff
- golden retrieval-fixtures måler kvalitet og lekkasje
- metrics og health er tilgjengelige
- canonical database kan regenerere indeksen

Milvus krever en separat implementerings- og aktiveringsbeslutning basert på måledata.

## Forkastede alternativer

### Milvus fra første backendversjon

Forkastet fordi dagens størrelse og eksisterende pgvector-grunnlag ikke dokumenterer behov for en separat vektorklynge.

### Leverandørspesifikk vektorkode i domenemodulene

Forkastet fordi retrieval, sletting og migrering må kunne testes uavhengig av leverandør.
