const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

for (const relative of [
  "backend/api/package.json",
  "backend/api/package-lock.json",
  "backend/api/tsconfig.json",
  "backend/api/tsconfig.build.json",
  "backend/api/README.md",
  "backend/api/contracts/aha-backend-v1.openapi.json",
  "backend/api/src/main.ts",
  "backend/api/src/app.module.ts",
  "backend/api/src/bootstrap.ts",
  "backend/api/src/config/app-config.ts",
  "backend/api/src/api/api-contract.ts",
  "backend/api/src/api/api-exception.filter.ts",
  "backend/api/src/database/canonical-database.service.ts",
  "backend/api/src/database/pg-connection.provider.ts",
  "backend/api/src/profiles/profile.controller.ts",
  "backend/api/src/profiles/profile.repository.ts",
  "backend/api/src/auth/auth.guard.ts",
  "backend/api/src/auth/jose-token-verifier.ts",
  "backend/api/src/audit/audit.interceptor.ts",
  "backend/api/src/audit/safe-audit.service.ts",
  "backend/api/src/health.controller.ts",
  "backend/api/src/auth-context.controller.ts",
  "backend/api/test/foundation.test.mjs",
  "backend/api/test/database.test.mjs",
  ".github/workflows/aha-nestjs-api-tests.yml"
]) {
  assert.equal(fs.existsSync(path.join(root, relative)), true, `${relative} mangler`);
}

const pkg = JSON.parse(read("backend/api/package.json"));
assert.equal(pkg.version, "0.2.0");
assert.equal(pkg.private, true);
assert.equal(pkg.type, "module");
assert.equal(pkg.engines.node, ">=20.11.0");
assert.deepEqual(pkg.scripts, {
  build: "tsc -p tsconfig.build.json",
  start: "node dist/main.js",
  test: "npm run build && node --test test/*.test.mjs"
});
assert.deepEqual(pkg.dependencies, {
  "@nestjs/common": "11.1.28",
  "@nestjs/core": "11.1.28",
  "@nestjs/platform-express": "11.1.28",
  "class-transformer": "0.5.1",
  "class-validator": "0.14.2",
  jose: "6.2.3",
  pg: "8.22.0",
  "reflect-metadata": "0.2.2",
  rxjs: "7.8.2"
});
assert.equal(pkg.devDependencies["@types/pg"], "8.20.0");
for (const forbidden of ["typeorm", "prisma", "@prisma/client", "langchain", "@langchain/langgraph", "@zilliz/milvus2-sdk-node"]) {
  assert.equal(pkg.dependencies[forbidden], undefined, `${forbidden} skal ikke inn i repository-PR-en`);
}

const lock = JSON.parse(read("backend/api/package-lock.json"));
assert.equal(lock.name, "@aha/nest-api");
assert.equal(lock.version, "0.2.0");
assert.equal(lock.lockfileVersion, 3);
assert.equal(lock.requires, true);
assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
assert.deepEqual(lock.packages[""].engines, pkg.engines);
for (const entry of Object.values(lock.packages).filter(Boolean)) {
  if (entry.resolved) assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//);
  if (entry.integrity) assert.match(entry.integrity, /^sha512-/);
}

const tsconfig = JSON.parse(read("backend/api/tsconfig.json"));
assert.equal(tsconfig.compilerOptions.strict, true);
assert.equal(tsconfig.compilerOptions.experimentalDecorators, true);
assert.equal(tsconfig.compilerOptions.emitDecoratorMetadata, true);
assert.equal(tsconfig.compilerOptions.module, "NodeNext");

const sourceFiles = [
  "backend/api/src/main.ts",
  "backend/api/src/app.module.ts",
  "backend/api/src/bootstrap.ts",
  "backend/api/src/config/app-config.ts",
  "backend/api/src/common/request-context.ts",
  "backend/api/src/common/request-context.middleware.ts",
  "backend/api/src/api/api-contract.ts",
  "backend/api/src/api/api-exception.ts",
  "backend/api/src/api/api-exception.filter.ts",
  "backend/api/src/auth/auth.types.ts",
  "backend/api/src/auth/public.decorator.ts",
  "backend/api/src/auth/auth.guard.ts",
  "backend/api/src/auth/jose-token-verifier.ts",
  "backend/api/src/audit/audit.types.ts",
  "backend/api/src/audit/safe-audit.service.ts",
  "backend/api/src/audit/audit.interceptor.ts",
  "backend/api/src/database/database-config.ts",
  "backend/api/src/database/database.types.ts",
  "backend/api/src/database/database.errors.ts",
  "backend/api/src/database/pg-connection.provider.ts",
  "backend/api/src/database/canonical-database.service.ts",
  "backend/api/src/database/database.module.ts",
  "backend/api/src/profiles/profile.repository.ts",
  "backend/api/src/profiles/profile.controller.ts",
  "backend/api/src/profiles/profiles.module.ts",
  "backend/api/src/health.controller.ts",
  "backend/api/src/auth-context.controller.ts",
  "backend/api/src/foundation-command.dto.ts"
];
const source = sourceFiles.map(read).join("\n");
assert.doesNotMatch(source, /@(Post|Put|Patch|Delete)\s*\(/, "repository foundation skal ikke ha generelle produktmutasjoner");
assert.doesNotMatch(source, /from ["'](typeorm|@prisma\/client|langchain|@langchain\/langgraph)/);
assert.doesNotMatch(source, /user_metadata|raw_user_meta_data/);
assert.match(source, /runtimeActivated:\s*boolean/);
assert.match(source, /runtimeActivated:\s*parseBoolean\(env\.AHA_RUNTIME_ACTIVATED,\s*false,\s*"AHA_RUNTIME_ACTIVATED"\)/);
assert.match(source, /databaseConnected:\s*false/);
assert.match(source, /existingExpressRuntimePrimary:\s*true/);
assert.match(read("backend/api/src/app.module.ts"), /provide:\s*APP_GUARD[\s\S]*useClass:\s*AuthGuard/);
assert.match(read("backend/api/src/app.module.ts"), /provide:\s*APP_FILTER[\s\S]*useClass:\s*ApiExceptionFilter/);
assert.match(read("backend/api/src/auth/auth.guard.ts"), /getAllAndOverride[\s\S]*IS_PUBLIC_ROUTE/);
assert.match(read("backend/api/src/auth/jose-token-verifier.ts"), /jwtVerify[\s\S]*issuer:[\s\S]*audience:/);
assert.match(read("backend/api/src/bootstrap.ts"), /whitelist:\s*true/);
assert.match(read("backend/api/src/bootstrap.ts"), /forbidNonWhitelisted:\s*true/);
assert.match(read("backend/api/src/bootstrap.ts"), /AHA_ALLOWED_ORIGINS|allowedOrigins/);

const databaseProvider = read("backend/api/src/database/pg-connection.provider.ts");
assert.match(databaseProvider, /from "pg"/);
assert.doesNotMatch(source.replace(databaseProvider, ""), /from ["']pg["']/);
const databaseService = read("backend/api/src/database/canonical-database.service.ts");
assert.match(databaseService, /set transaction read only/);
assert.match(databaseService, /set_config\('request\.jwt\.claims', \$1, true\)/);
assert.match(databaseService, /set_config\('row_security', 'on', true\)/);
assert.match(databaseService, /rolbypassrls/);
assert.match(databaseService, /can_assume_table_owner/);
assert.match(databaseService, /rollback/);
assert.doesNotMatch(databaseService, /connectionString|AHA_DATABASE_URL/);

const auditInterceptor = read("backend/api/src/audit/audit.interceptor.ts");
assert.doesNotMatch(auditInterceptor, /request\.(headers|query|body)/);
assert.match(auditInterceptor, /principalHash/);
assert.match(auditInterceptor, /safeRoute\(request\)/);
const auditTypes = read("backend/api/src/audit/audit.types.ts");
assert.doesNotMatch(auditTypes, /token|authorization|body|query|email/i);

const health = read("backend/api/src/health.controller.ts");
assert.match(health, /@Public\(\)/);
assert.match(health, /@Get\("health"\)/);
assert.match(health, /runtimeActivated/);
assert.match(health, /existingExpressRuntimePrimary/);
assert.match(health, /canonicalSchemaPresent \? "present" : "not_connected"/);

const authContext = read("backend/api/src/auth-context.controller.ts");
assert.doesNotMatch(authContext, /@Public\(\)/);
assert.match(authContext, /apiSuccess/);
assert.match(authContext, /subject:[\s\S]*provider:[\s\S]*issuer:[\s\S]*audience:/);
assert.doesNotMatch(authContext, /token|email|metadata/i);

const profileRepository = read("backend/api/src/profiles/profile.repository.ts");
assert.match(profileRepository, /where id = aha\.current_profile_id\(\)/);
assert.doesNotMatch(profileRepository, /select \*|auth_subject|metadata/i);
const profileController = read("backend/api/src/profiles/profile.controller.ts");
assert.match(profileController, /@Get\("profile"\)/);
assert.doesNotMatch(profileController, /@(Post|Put|Patch|Delete)\s*\(/);

const config = read("backend/api/src/config/app-config.ts");
assert.match(config, /AHA auth configuration is required in production/);
assert.match(config, /AHA_ALLOWED_ORIGINS is required in production/);
assert.match(config, /cannot contain a wildcard/);
assert.match(config, /at least 32 characters in production/);
assert.match(config, /AHA_RUNTIME_ACTIVATED/);
assert.match(config, /parseBoolean\(env\.AHA_RUNTIME_ACTIVATED, false/);
const databaseConfig = read("backend/api/src/database/database-config.ts");
assert.match(databaseConfig, /AHA_DATABASE_ENABLED/);
assert.match(databaseConfig, /verify-full in production/);
assert.match(databaseConfig, /AHA_DATABASE_URL is required/);

const workflow = read(".github/workflows/aha-nestjs-api-tests.yml");
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(workflow, /working-directory:\s*backend\/api/);
assert.match(workflow, /node-version:\s*22/);
assert.match(workflow, /cache:\s*npm/);
assert.match(workflow, /cache-dependency-path:\s*backend\/api\/package-lock\.json/);
assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
assert.match(workflow, /npm run build/);
assert.match(workflow, /node --test test\/\*\.test\.mjs/);
assert.doesNotMatch(workflow, /npm install --package-lock-only|Upload generated lockfile|git push|contents:\s*write/);

const openApi = JSON.parse(read("backend/api/contracts/aha-backend-v1.openapi.json"));
assert.equal(openApi.openapi, "3.1.0");
assert.equal(openApi.info.version, "0.2.0");
assert.deepEqual(Object.keys(openApi.paths).sort(), [
  "/v1/auth/context",
  "/v1/health",
  "/v1/local-imports/commit",
  "/v1/local-imports/confirmation",
  "/v1/profile",
  "/v1/sync/bootstrap",
  "/v1/sync/pull",
  "/v1/sync/push"
]);
const explicitPostCommands = new Set([
  "/v1/local-imports/commit",
  "/v1/local-imports/confirmation",
  "/v1/sync/push"
]);
const explicitSyncReads = new Set(["/v1/sync/bootstrap", "/v1/sync/pull"]);
for (const [route, pathItem] of Object.entries(openApi.paths)) {
  if (explicitPostCommands.has(route)) {
    assert.ok(pathItem.post, `${route} skal eksponere kun den eksplisitte POST-kommandoen`);
    assert.equal(pathItem.get, undefined, `${route} skal ikke også bli en leserute`);
  } else {
    assert.equal(pathItem.post, undefined, `${route} skal forbli read-only`);
    assert.ok(pathItem.get, `${route} skal være eksplisitt GET`);
  }
  if (explicitSyncReads.has(route)) {
    assert.equal(pathItem.get.security?.[0]?.bearerAuth?.length, 0, `${route} skal være autentisert`);
  }
  assert.equal(pathItem.put, undefined);
  assert.equal(pathItem.patch, undefined);
  assert.equal(pathItem.delete, undefined);
}
assert.equal(openApi.paths["/v1/sync/push"].post.security?.[0]?.bearerAuth?.length, 0);
assert.equal(openApi.components.schemas.CanonicalSyncObjectType.enum.length, 10);
assert.equal(openApi.components.schemas.CanonicalSyncObjectType.enum.includes("note"), false);

const rootPackage = JSON.parse(read("package.json"));
assert.equal(rootPackage.main, "server.js");
assert.equal(rootPackage.scripts.start, "node server.js");
assert.doesNotMatch(read("server.js"), /backend\/api|aha-nest-api/);
assert.doesNotMatch(read("render.yaml"), /rootDir:\s*backend\/api|name:\s*aha-nest-api/);

const backendReadme = read("backend/api/README.md");
assert.match(backendReadme, /aktiv canonical production-backend[\s\S]*bounded manual pilot[\s\S]*2 verifiserte profiler/i);
assert.match(backendReadme, /Ikke generell production-sync/i);
assert.match(backendReadme, /runtime-grants/i);
assert.match(backendReadme, /non-owner|BYPASSRLS/i);
assert.match(backendReadme, /automatic sync = false[\s\S]*background sync = false/i);
assert.match(read("docs/AHA_BACKEND_API_CONTRACT_V1.md"), /fail-closed backend foundation[\s\S]*frontend runtime not activated/i);
assert.match(read("docs/AHA_BACKEND_API_CONTRACT_V1.md"), /AHA_CANONICAL_SYNC_ENABLED=false/i);
assert.match(read("docs/AHA_BACKEND_API_CONTRACT_V1.md"), /POST \/v1\/sync\/push/i);

console.log("aha-nestjs-api-foundation.test.cjs passed");
