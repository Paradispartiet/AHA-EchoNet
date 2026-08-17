# AHA canonical production on Azure

Status: **IaC and operational gates are implemented in the repository; no Azure production resources are created by merge. Canonical production sync remains disabled.**

This directory implements the production direction locked by `docs/adr/ADR-006-azure-container-apps-before-aks.md` and `ops/canonical-sync-production-rollout-v1.json`.

## Topology

```text
GitHub Actions (OIDC, protected environment)
        |
        v
Azure Resource Group: rg-aha-canonical-prod
        |
        +-- VNet 10.70.0.0/16
        |    +-- snet-containerapps 10.70.0.0/23
        |    +-- snet-postgresql    10.70.4.0/27
        |
        +-- Azure Container Apps Environment
        |    +-- aha-canonical-api-production
        |    +-- aha-canonical-db-init-production (manual job)
        |    +-- aha-canonical-restore-verify     (ephemeral manual job)
        |
        +-- Azure Database for PostgreSQL Flexible Server 16
        |    +-- private delegated subnet only
        |    +-- private DNS
        |    +-- database: aha
        |    +-- 35-day backup retention
        |
        +-- Runtime Key Vault
        |    +-- readiness-role database DSN
        |    +-- database CA
        |    +-- audit hash salt
        |
        +-- Operations Key Vault
        |    +-- migration-only admin DSN
        |    +-- database CA
        |    +-- generated readiness password
        |
        +-- Runtime managed identity
        |    +-- runtime Key Vault Secrets User
        |    +-- ACR pull
        |
        +-- Migration managed identity
        |    +-- operations Key Vault Secrets User
        |    +-- ACR pull
        |
        +-- Azure Container Registry
        +-- Log Analytics
        +-- Application Insights
```

The API runtime identity cannot read the operations vault containing the PostgreSQL administrator DSN. The migration identity cannot become the API identity. The production sync database role is a third boundary and remains `NOLOGIN` until a separate pilot activation exists.

## Files

- `main.bicep` — subscription entrypoint and dedicated production resource group.
- `platform.bicep` — VNet, Container Apps environment, PostgreSQL, runtime identity/vault, ACR and telemetry.
- `operations.bicep` — migration identity and operations-only Key Vault.
- `deployment-access.bicep` — scoped deployment-principal Key Vault secret lifecycle permission.
- `postgres-config.bicep` — PostgreSQL extension allowlist (`pgcrypto`).
- `app.bicep` — NestJS production API with database connected through the readiness role and canonical sync hard-disabled.
- `db-init-job.bicep` — manual migration/restore-verification Container Apps Job.
- `db-init/` — immutable PostgreSQL migration image, fail-closed production roles and verify-full runner.

## Database identities

### `aha_canonical_production_readiness`

Used only while production is pre-pilot. It can authenticate so `/v1/health` can prove real database reachability and runtime-role safety. It has:

- `LOGIN`;
- `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`;
- `row_security=on`;
- schema `USAGE` only;
- no canonical table privileges;
- no canonical function execution.

### `aha_canonical_production_runtime`

Future sync runtime. Before activation it has:

- `NOLOGIN` and `PASSWORD NULL`;
- the same safe intrinsic flags;
- no direct table writes;
- schema `USAGE`;
- effective `EXECUTE` on exactly:
  - `aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer)`
  - `aha.pull_sync_changes_v1(text,bigint,integer)`
  - `aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb)`

No workflow in this delivery changes this role to `LOGIN`.

## Required GitHub environments

### `aha-canonical-production-infra`

Deployment/operations environment. Configure these protected secrets before running any Azure workflow:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
AZURE_DEPLOY_PRINCIPAL_OBJECT_ID
AHA_PRODUCTION_POSTGRES_ADMIN_PASSWORD
AHA_PRODUCTION_DATABASE_CA_CERT
AHA_PRODUCTION_AUDIT_HASH_SALT
```

Optional environment variables, with repository defaults if omitted:

```text
AHA_PRODUCTION_AZURE_LOCATION=westeurope
AHA_PRODUCTION_RESOURCE_GROUP=rg-aha-canonical-prod
AHA_PRODUCTION_PREFIX=aha-prod
AHA_PRODUCTION_POSTGRES_ADMIN_LOGIN=ahaadmin
```

Azure login uses GitHub OIDC; there is no long-lived Azure client secret in the workflow.

The OIDC deployment identity must be able to deploy the production resource group and create the scoped RBAC assignments in these templates. After the initial platform bootstrap, narrow the principal to the dedicated production scope; do not use a human owner credential in CI.

### `aha-canonical-production-readiness`

This is the already-defined read-only production rollout environment from `AHA_CANONICAL_SYNC_PRODUCTION_ROLLOUT_GATE_V1.md`. It is populated only after platform, migration, restore and observability evidence are green.

## Mandatory execution order

Do not skip gates.

1. **Repository CI** — `AHA Azure production IaC validation` compiles Bicep and builds both production images without Azure credentials.
2. **Migration rehearsal** — manually run `AHA Azure production migration rehearsal` with `RUN_AHA_AZURE_PRODUCTION_MIGRATION_REHEARSAL`. Store the artifact/run URL as production migration rehearsal evidence.
3. **Platform deployment** — manually run `AHA Azure production platform deploy` with `RUN_AHA_AZURE_PRODUCTION_PLATFORM_DEPLOY`. It creates the isolated Azure platform, migrates the empty dedicated database, deploys the API through the catalog-only readiness role, and proves health while sync remains disabled.
4. **Backup/restore rehearsal** — manually run `AHA Azure production backup restore rehearsal` with `RUN_AHA_AZURE_PRODUCTION_BACKUP_RESTORE_REHEARSAL`. It performs a real point-in-time restore to a separate private server, validates the restored canonical schema read-only, uploads evidence, then deletes the restored server.
5. **Observability readiness** — manually run `AHA Azure production observability readiness` with `RUN_AHA_AZURE_PRODUCTION_OBSERVABILITY_READINESS`. It proves Container Apps request/latency/error metrics, PostgreSQL connection/query-load metrics, Log Analytics audit ingestion and credential-redaction checks.
6. **Production rollout gate** — populate `aha-canonical-production-readiness` with the resulting evidence pointers and run `AHA canonical sync production rollout gate`.
7. Only after step 6 is green may a separate one-profile pilot activation be implemented.

## Initial database creation versus later migrations

The platform workflow initializes a brand-new, isolated production database while canonical sync is disabled and before any production canonical user data exists. It does **not** copy staging or legacy data into production.

After the first platform creation, every future schema change must follow the stricter sequence:

```text
migration rehearsal
→ verified production backup/restore capability
→ production migration
→ health + observability verification
```

There is no automatic destructive down-migration. Schema rollback is `forward-fix` or verified restore.

## Backup and restore

PostgreSQL is configured with 35-day backup retention. The restore gate does not accept “backups are enabled” as evidence. It provisions a separate PITR server, preserves the private VNet boundary, runs the same verification image in `verify_restore` mode with `default_transaction_read_only=on`, uploads evidence, and removes the temporary server.

The production source server is not modified by that verification.

## Observability

The platform routes Container Apps console/system logs to Log Analytics and creates workspace-based Application Insights. The readiness gate requires metric definitions that cover:

- request count / HTTP status;
- response time;
- replica restarts and capacity;
- PostgreSQL active/failed connections;
- database availability;
- session/query activity and block reads/hits.

AHA's `AhaSafeAudit` console event contains request ID, hashed principal, method, route, status, duration, outcome/error code and deployment version. The observability gate verifies those safe audit events reach Log Analytics and refuses credential-shaped telemetry.

Raw conversation payloads, bearer tokens, database URLs and secret values are not an observability contract.

## Rollback

Before pilot activation, `AHA Azure production API rollback` can move the production API back to an existing immutable ACR image by full Git SHA. It refuses to run if canonical sync is already active and reasserts:

```text
AHA_CANONICAL_SYNC_ENABLED=false
AHA_LOCAL_IMPORT_ENABLED=false
```

Database rollback remains forward-fix or verified restore. A future pilot activation must add database-first runtime credential cutoff and active-session termination before it is allowed to enable `aha_canonical_production_runtime`.

## Explicit non-goals

This platform delivery does not:

- run automatically on merge;
- create Azure resources until a protected operator manually dispatches the deployment workflow;
- enable canonical sync;
- add sync to Home/login/auth-ready/timers;
- copy staging or legacy production data;
- use Render for production;
- create public/group sharing;
- create the one-profile pilot activation workflow.
