const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const adrDir = path.join(root, "docs", "adr");
const read = (name) => fs.readFileSync(path.join(adrDir, name), "utf8");

const decisions = [
  {
    file: "ADR-001-postgresql-system-of-record.md",
    required: [/Status: \*\*Accepted\*\*/, /PostgreSQL.*system of record/i, /local_only/, /tenant/i, /restore/i]
  },
  {
    file: "ADR-002-local-first-cache-and-offline.md",
    required: [/Status: \*\*Accepted\*\*/, /IndexedDB/, /outbox/, /ingen skjult.*opplasting/i, /tombstone/i]
  },
  {
    file: "ADR-003-nestjs-command-backend.md",
    required: [/Status: \*\*Accepted\*\*/, /NestJS.*primære applikasjonsbackend/i, /modulær monolitt/i, /FastAPI.*intern/i, /idempotency/i]
  },
  {
    file: "ADR-004-hasura-gated-read-layer.md",
    required: [/Status: \*\*Accepted\*\*/, /proof-of-value/i, /read models/i, /Sensitive writes går gjennom NestJS/i, /cross-tenant/i]
  },
  {
    file: "ADR-005-pgvector-before-milvus.md",
    required: [/Status: \*\*Accepted\*\*/, /PgVectorStore/, /MilvusVectorStore/, /PostgreSQL forblir system of record/i, /shadow/i]
  },
  {
    file: "ADR-006-azure-container-apps-before-aks.md",
    required: [/Status: \*\*Accepted\*\*/, /Azure Container Apps før AKS/i, /PostgreSQL Flexible Server/i, /Key Vault/i, /faktisk restore-test/i]
  }
];

const index = read("README.md");
assert.match(index, /kanoniske målbeslutninger — ikke runtime-aktivering/i);
assert.match(index, /Alle seks ADR-er er `Accepted`, men ikke automatisk `Implemented`/);

for (const decision of decisions) {
  assert.equal(fs.existsSync(path.join(adrDir, decision.file)), true, `${decision.file} mangler`);
  const content = read(decision.file);
  for (const pattern of decision.required) {
    assert.match(content, pattern, `${decision.file} mangler kontrakten ${pattern}`);
  }
  assert.match(index, new RegExp(decision.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const roadmap = fs.readFileSync(path.join(root, "docs", "AHA_BACKEND_FOUNDATION_ROADMAP_V1.md"), "utf8");
for (let number = 1; number <= 6; number += 1) {
  assert.match(roadmap, new RegExp(`ADR-00${number}`));
}
assert.match(roadmap, /PR 1 — Backend Architecture ADRs/);
assert.match(roadmap, /PR 2 — Canonical PostgreSQL Schema v1/);

console.log("aha-backend-architecture-adrs.test.cjs passed");
