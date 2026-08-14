# AHA NestJS API foundation

Status: **separat, fail-closed backendgrunnlag — ikke aktiv AHA-runtime**

Denne tjenesten er PR 4 i `AHA_BACKEND_FOUNDATION_ROADMAP_V1.md`. Den etablerer en modulær NestJS-grunnmur for senere auth-, kommando-, database- og auditflyt uten å overta dagens `server.js`/Express-runtime.

## Dette finnes

- `GET /v1/health` — offentlig liveness/status
- `GET /v1/auth/context` — beskyttet kontroll av verifisert principal
- global Bearer/JWKS-verifisering
- validert request-ID
- streng global DTO-validering
- eksplisitt CORS-allowlist
- redigert audit-event uten token, body, query eller rå subject
- e2e- og kontrakttester
- committet npm lockfile v3 for reproducerbare installs
- read-only CI som bygger og tester med `npm ci`

## Dette finnes ikke

- databaseklient eller runtime-grants
- canonical PostgreSQL-writes
- kontoimport
- bidireksjonal sync
- produktmutasjoner
- Hasura
- LangGraph/LangChain
- Milvus
- Azure-deploy
- frontendkobling
- EchoNet-deling
- ekstern publisering

Health-responsen rapporterer derfor:

```json
{
  "runtimeActivated": false,
  "existingExpressRuntimePrimary": true,
  "database": {
    "connected": false,
    "canonicalSchema": "not_connected"
  }
}
```

## Miljøvariabler

| Variabel | Påkrevd i production | Formål |
|---|---:|---|
| `NODE_ENV` | ja | `development`, `test` eller `production` |
| `PORT` | nei | standard `3100` |
| `AHA_API_VERSION` | nei | serviceversjon i health/audit |
| `AHA_ALLOWED_ORIGINS` | ja | kommaseparert liste uten wildcard |
| `AHA_AUTH_ISSUER` | ja | verifisert JWT issuer |
| `AHA_AUTH_AUDIENCE` | ja | forventet JWT audience |
| `AHA_AUTH_JWKS_URL` | ja | HTTPS JWKS-endepunkt |
| `AHA_AUTH_PROVIDER` | nei | canonical provider-navn, standard `supabase` |
| `AHA_AUDIT_HASH_SALT` | ja | minst 32 tegn; hasher principal før audit |

Tjenesten starter ikke i production hvis auth, origins eller audit-salt mangler.

## Lokal bygg og test

```bash
cd backend/api
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

`package-lock.json` er committet og skal oppdateres sammen med enhver tilsiktet avhengighetsendring. CI har bare `contents: read` og kan ikke omskrive lockfilen eller PR-branchen.

## Auth-grense

JWT verifiseres med signatur, issuer og audience gjennom `jose` og remote JWKS. Den interne principalen inneholder bare:

```text
subject
provider
issuer
audience
```

Rå token, e-post, profilnavn, `user_metadata`, `raw_user_meta_data` og klientoppgitte roller brukes ikke som autorisasjonssannhet.

## Audit-grense

Audit-event inneholder bare:

```text
eventId
occurredAt
requestId
salted principalHash
method
route template
statusCode
durationMs
outcome
safe errorCode
service/version
```

Audit transport er foreløpig en redigert konsollsink. Den er ikke canonical auditlagring. Senere databasepersist skal gå gjennom en backend-only adapter til `aha.audit_events`.

## Neste steg

Neste leveranse er repository-/databaseadapteren og stabile API-kontrakter. Før databasekobling må tjenesten få en dedikert non-owner/no-`BYPASSRLS` runtime-rolle, eksplisitte minimumsgrants og faktiske PostgreSQL/RLS-integrasjonstester.
