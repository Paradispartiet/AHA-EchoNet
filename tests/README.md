# AHA Node tests

Deterministiske Node-tester for AHA-frontendlogikken. Hver testfil er et
frittstående script som bruker `node:assert` og avslutter med exit-kode != 0
ved feil.

## Kjøre testene

```bash
npm test
```

Dette kjører `scripts/run-node-tests.mjs`, som finner alle testfilene i `tests/`
og kjører hver i sin egen prosess. Suiten gater CI via `.github/workflows/node-tests.yml`.

Testene bruker kun Node-innebygde moduler (`assert`, `fs`, `vm`), så ingen
`npm install` er nødvendig for å kjøre dem.

## Opt-in / eksterne tester

Noen tester krever eksterne avhengigheter og er holdt utenfor standard-suiten:

```bash
# Krever at Python AHA-motoren kjører (uvicorn).
npm run test:aha-python-smoke
```

Eksklusjonslisten ligger i `scripts/run-node-tests.mjs`.

## Legge til en test

1. Lag `tests/<navn>.test.cjs` (eller `.mjs`).
2. Bruk `node:assert` og kast/`process.exit(1)` ved feil.
3. Skriv en kort suksesslinje til slutt (f.eks. `console.log("... passed")`).

Filen plukkes automatisk opp av runneren og CI.
