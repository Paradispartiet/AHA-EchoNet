# AHA Backend Architecture Decision Records

Status: **kanoniske målbeslutninger — ikke runtime-aktivering**  
Dato: 14. august 2026

Disse Architecture Decision Records (ADR-er) låser de første tekniske beslutningene i `AHA_BACKEND_FOUNDATION_ROADMAP_V1.md`.

De beskriver målarkitekturen for overgangen fra dagens local-first AHA til en flerbrukerplattform med kontoer, synkronisering, grupper og kontrollerte AI-jobber. De aktiverer ikke backend, synk, EchoNet-deling, ekstern publisering, modelltrening eller History Go-tilbakeskriving.

## Beslutninger

| ADR | Status | Beslutning |
|---|---|---|
| [ADR-001](./ADR-001-postgresql-system-of-record.md) | Accepted | PostgreSQL er system of record for synkroniserte konto- og arbeidsromdata. |
| [ADR-002](./ADR-002-local-first-cache-and-offline.md) | Accepted | Local-first beholdes som eksplisitt local-only-modus, offline-cache og outbox — ikke som ukontrollert parallell sannhet. |
| [ADR-003](./ADR-003-nestjs-command-backend.md) | Accepted | NestJS eier kommandoer, forretningsregler, samtykke, deling, audit og jobbstart. |
| [ADR-004](./ADR-004-hasura-gated-read-layer.md) | Accepted | Hasura kan bare brukes som avgrenset lese- og subscriptionslag etter en dokumentert verdibevis-port. |
| [ADR-005](./ADR-005-pgvector-before-milvus.md) | Accepted | Pgvector brukes først; Milvus ligger bak adapter og krever målt aktiveringsbehov. |
| [ADR-006](./ADR-006-azure-container-apps-before-aks.md) | Accepted | Azure Container Apps brukes før AKS, og Azure aktiveres først etter grønn stagingport. |

## Statusspråk

- **Proposed:** diskutert, ikke bindende.
- **Accepted:** bindende målbeslutning for kommende implementasjon.
- **Implemented:** beslutningen er realisert og testet i runtime.
- **Superseded:** erstattet av en nyere ADR.
- **Rejected:** vurdert, men ikke valgt.

Alle seks ADR-er er `Accepted`, men ikke automatisk `Implemented`.

## Prioritet ved konflikt

1. Runtime-kode og grønne kontraktstester beskriver hva som faktisk kjører.
2. Release readiness- og maturity-dokumentene beskriver dagens aktiverte produktgrense.
3. Disse ADR-ene beskriver bindende målbeslutninger for backendmigreringen.
4. `AHA_BACKEND_FOUNDATION_ROADMAP_V1.md` beskriver rekkefølge og aktiveringsporter.
5. Eldre søknads- og forretningsdokumenter beskriver visjon og tidligere plan.

En ADR kan bare endres gjennom en ny ADR som uttrykkelig erstatter den. Historikken skal beholdes.

## Felles sikkerhetsregler

Alle implementeringer av disse ADR-ene skal bevare følgende grenser:

- `local_only` lastes aldri opp uten en ny eksplisitt brukerhandling.
- Personlig innsikt deles aldri automatisk til gruppe eller globalt lag.
- Semantisk likhet er aldri samtykke til deling, rettelse eller overskriving.
- PostgreSQL-data skal være tenant-isolerte og ha revisjon, provenance og audit.
- AI-orkestrering kan ikke eie tilgangsregler eller samtykke.
- Vektorlager er avledet søkeindeks, ikke canonical sannhet.
- Ingen ny tjeneste kan bli offentlig skrivevei uten egen kontrakt og regresjonstester.
- Dagens JavaScript- og local-first-fallback fjernes ikke før ny flyt har paritet og dokumentert rollback.
