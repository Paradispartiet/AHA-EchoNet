# AHA PostgreSQL Staging Rehearsal v1

Status: **automatisk ren PostgreSQL 16-integrasjonsport — ikke produksjonsaktivering**

Denne porten er neste steg etter `AHA_LOCAL_IMPORT_POSTGRESQL_V1.md`. Den erstatter ikke en senere rehearsal mot den faktiske Supabase-/produksjonskonfigurasjonen, men beviser at canonical `aha.*`-migrasjonene og local-account-importen kan installeres og kjøres sammen i en ren PostgreSQL 16-database med en eksplisitt minst-privilegert runtime-rolle.

## Hva CI gjør

Workflow:

```text
.github/workflows/aha-postgresql-staging-rehearsal.yml
```

Runner:

```text
scripts/aha-postgresql-staging-rehearsal.sh
```

Runtime-fixture:

```text
supabase/tests/aha_postgresql_staging_rehearsal_v1.sql
```

Porten:

1. starter en tom `postgres:16` service-container;
2. kjører alle timestampede canonical migrasjoner i filnavnrekkefølge;
3. oppretter en separat `aha_runtime_rehearsal`-rolle;
4. verifiserer `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE` og `NOINHERIT`;
5. verifiserer at rollen ikke kan anta canonical table-owner;
6. gir bare `USAGE`, minimale SELECT-rettigheter til RLS-rehearsal og eksplisitte helper-/importfunksjoner;
7. gir ingen direkte INSERT/UPDATE/DELETE på canonical tabeller;
8. gir `EXECUTE` på `aha.commit_local_import_v1(...)`, men ikke den interne `aha.record_local_import_item_v1(...)`;
9. kjører to separate tenant-identiteter gjennom `request.jwt.claims`;
10. beviser at hver tenant bare kan se egen profil og eget workspace gjennom RLS;
11. beviser at direkte canonical write fra runtime-rollen blir avvist;
12. kjører en reell local import for tenant A;
13. kjører samme import på nytt og krever `idempotentReplay=true`;
14. kjører en uavhengig import for tenant B;
15. forsøker en ID-kollisjon fra tenant A mot tenant Bs canonical objekt og krever at hele kommandoen rulles tilbake;
16. kontrollerer som databaseeier at det bare finnes to import-batcher, to eksakte account-import-samtykker, fire objektkvitteringer og de forventede canonical samtale-/meldingsradene.

## Sikkerhetsgrense

Denne workflowen bruker kun ephemeral CI-data og en hardkodet rehearsal-passordverdi. Den leser ingen GitHub Secrets og kobler ikke til en virkelig Supabase-, Azure- eller produksjonsdatabase.

Porten skal derfor kunne kjøres på enhver pull request som endrer canonical migrasjoner eller importkontrakten uten risiko for å skrive til ekte brukerdata.

## Hva porten beviser

En grønn port betyr at:

- migrasjonssettet kan installeres fra null på PostgreSQL 16;
- `SECURITY DEFINER`-importkommandoen fungerer med låst search path;
- runtime-rollen kan være non-owner og uten `BYPASSRLS`;
- importen trenger ikke generelle canonical table-writes;
- RLS isolerer de testede profil-/workspace-lesingene;
- identisk retry er idempotent;
- cross-workspace ID-kollisjon failer atomisk uten delvis import;
- exact account-import consent og per-object receipts materialiseres i databasen.

## Hva porten ikke beviser

Den erstatter ikke:

- staging mot den faktiske Supabase-instansen;
- kontroll av reelle Supabase connection roles og pooler;
- TLS/`verify-full` mot hostet database;
- ekte NestJS → PostgreSQL nettverksrehearsal;
- frontend-preview og brukerbekreftelse i nettleser;
- eksport-/restore-endepunkt;
- bidireksjonal sync;
- backup/restore i drift;
- belastning, failover eller observability;
- Azure-produksjonsoppsett.

## Neste port

Etter at denne CI-porten er grønn og merget er neste kontrollerte leveranse en **hosted staging rehearsal** mot den valgte PostgreSQL/Supabase-instansen. Den skal bruke en dedikert non-owner runtime-role, eksplisitte miljøhemmeligheter, migrationsdry-run/backup og representative testdata — aldri produksjonsbrukere.

Først når hosted staging også er grønn, kan UI-aktivering av local account import vurderes.
