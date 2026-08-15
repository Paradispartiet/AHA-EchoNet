# AHA PostgreSQL Hosted Staging Preflight v1

Status: **manuell, read-only og fail-closed — ingen migrasjon eller produksjonsaktivering**

Denne porten kommer etter den automatiske ephemeral PostgreSQL 16-rehearsalen. Den er første kontrakt for å kontrollere en faktisk hostet PostgreSQL/Supabase-stagingdatabase uten å skrive data eller kjøre migrasjoner.

## Hvorfor egen port

En lokal/CI PostgreSQL-container beviser SQL- og RLS-kontrakten, men ikke at den hostede staginginstansen har:

- riktig database og miljøidentitet;
- TLS på både admin- og runtime-tilkobling;
- separat runtime-role;
- `NOSUPERUSER` og uten `BYPASSRLS`;
- ingen direkte canonical write-grants;
- riktig `EXECUTE`-grense dersom canonical schema allerede er installert.

Derfor må hostet staging identifiseres og valideres før noen workflow får lov til å kjøre migrasjoner.

## GitHub Environment

Workflowen bruker miljøet:

```text
aha-postgresql-staging
```

Det miljøet skal opprettes eksplisitt i GitHub og skal aldri peke på produksjonsdatabasen.

Miljøet trenger tre secrets:

```text
AHA_STAGING_ADMIN_DATABASE_URL
AHA_STAGING_RUNTIME_DATABASE_URL
AHA_STAGING_DATABASE_FINGERPRINT
```

DSN-ene skal være forskjellige roller mot samme stagingdatabase:

- `ADMIN_DATABASE_URL`: rollen som senere kan brukes kontrollert til schema-migrasjoner;
- `RUNTIME_DATABASE_URL`: den minst privilegerte NestJS-rollen.

Ingen av verdiene skal lagres i repoet eller skrives i workflow-logg.

## Database-markør og fingerprint

Før første kjøring skal stagingdatabasen ha eksplisitte databaseinnstillinger:

```sql
ALTER DATABASE <staging_database>
  SET "aha.environment" = 'staging';

ALTER DATABASE <staging_database>
  SET "aha.environment_fingerprint" = '<lang-tilfeldig-hemmelig-verdi>';
```

Den samme fingerprint-verdien lagres som `AHA_STAGING_DATABASE_FINGERPRINT` i GitHub Environment.

Dette gjør at en feilkopiert produksjons-DSN ikke er nok til å kjøre porten: både admin- og runtime-tilkoblingen må rapportere `aha.environment=staging` og samme hemmelige fingerprint.

## Workflow

```text
.github/workflows/aha-postgresql-hosted-staging-preflight.yml
```

Den har bare `workflow_dispatch`. Det finnes ingen `push`, `pull_request`, `schedule` eller automatisk aktivering.

Kjøringen krever den eksakte manuelle teksten:

```text
RUN_AHA_HOSTED_STAGING_PREFLIGHT
```

## Read-only teknisk sperre

Alle `psql`-kall kjøres med:

```text
PGOPTIONS='-c default_transaction_read_only=on ...'
```

Denne leveransen kjører ikke:

```text
CREATE
ALTER
DROP
INSERT
UPDATE
DELETE
TRUNCATE
GRANT
REVOKE
psql -f <migration>
```

mot hostet database.

## Kontroller

Preflighten krever:

1. begge DSN-er og fingerprint er konfigurert;
2. eksakt manuell confirmation;
3. begge tilkoblinger rapporterer `aha.environment=staging`;
4. begge matcher den hemmelige staging-fingerprinten;
5. begge bruker TLS;
6. admin og runtime peker på samme database;
7. admin- og runtime-role er forskjellige;
8. PostgreSQL er minst versjon 15;
9. runtime-role er ikke superuser;
10. runtime-role har ikke `BYPASSRLS`;
11. runtime-role har ikke `CREATEDB` eller `CREATEROLE`;
12. runtime-role har `NOINHERIT`;
13. runtime-role eier ingen canonical `aha`-tabeller;
14. runtime-role har ingen direkte `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` på `aha.*`;
15. hvis canonical schema allerede finnes, må runtime-role kunne kjøre bare den eksplisitte local-import-kommandoen og ikke den interne receipt-helperen.

Preflighten skriver ikke ut host, DSN, brukernavn eller fingerprint.

## Hva en grønn preflight betyr

En grønn kjøring betyr bare at den hostede stagingdatabasen er identifisert og har en sikker nok rolle-/TLS-grunnflate til å gå videre til en **egen migrasjonsrehearsal**.

Den betyr ikke at:

- canonical migrasjonene er installert på hosted staging;
- local account import er kjørt der;
- NestJS er deployet mot databasen;
- frontendimport er aktivert;
- sync eller EchoNet er aktivert.

## Neste port

Etter grønn hosted preflight kommer en separat, eksplisitt **hosted migration + import rehearsal**. Den skal ha backup/schema-snapshot, migrasjonsdiff, representative staging-fixtures, cleanup og eksport/paritetskontroll.

Den porten skal ikke bygges som automatisk `push`-jobb og skal aldri bruke produksjonsbrukere eller produksjonsdata.
