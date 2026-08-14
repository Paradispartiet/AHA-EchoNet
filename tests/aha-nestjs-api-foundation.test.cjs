const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const apiRoot = path.join(root, "backend", "api");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

for (const relative of [
  "backend/api/package.json",
  "backend/api/tsconfig.json",
  "backend/api/tsconfig.build.json",
  "backend/api/README.md",
  "backend/api/src/main.ts",
  "backend/api/src/app.module.ts",
  "backend/api/src/bootstrap.ts",
  "backend/api/src/config/app-config.ts",
  "backend/api/src/auth/auth.guard.ts",
  "backend/api/src/auth/jose-token-verifier.ts",
  "backend/api/src/audit/audit.interceptor.ts",
  "backend/api/src/audit/safe-audit.service.ts",
  "backend/api/src/health.controller.ts",
  "backend/api/src/auth-context.controller.ts",
  "backend/api/test/foundation.test.mjs",
  ".github/workflows/aha-nestjs-api-tests.yml"
]) {
  assert.equal(fs.existsSync(path.join(root, relative)), true, `${relative} mangler`);
}

const pkg = JSON.parse(read("backend/api/package.json"));
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
  "jose": "6.2.3",
  "reflect-metadata": "0.2.2",
  "rxjs": "7.8.2"
});
for (const forbidden of ["pg", "typeorm", "prisma", "@prisma/client", "langchain", "@langchain/langgraph", "@zilliz/milvus2-sdk-node"] ) {
  assert.equal(pkg.dependencies[forbidden], undefined, `${forbidden} skal ikke inn i foundation-PR-en`);
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
  "backend/api/src/auth/auth.types.ts",
  "backend/api/src/auth/public.decorator.ts",
  "backend/api/src/auth/auth.guard.ts",
  "backend/api/src/auth/jose-token-verifier.ts",
  "backend/api/src/audit/audit.types.ts",
  "backend/api/src/audit/safe-audit.service.ts",
  "backend/api/src/audit/audit.interceptor.ts",
  "backend/api/src/health.controller.ts",
  "backend/api/src/auth-context.controller.ts",
  "backend/api/src/foundation-command.dto.ts"
];
const source = sourceFiles.map(read).join("\n");
assert.doesNotMatch(source, /@(Post|Put|Patch|Delete)\s*\(/, "foundation skal ikke ha produktmutasjoner");
assert.doesNotMatch(source, /from ["'](pg|typeorm|@prisma\/client|langchain|@langchain\/langgraph)/);
assert.doesNotMatch(source, /user_metadata|raw_user_meta_data/);
assert.match(source, /runtimeActivated:\s*false/);
assert.match(source, /databaseConnected:\s*false/);
assert.match(source, /existingExpressRuntimePrimary:\s*true/);
assert.match(read("backend/api/src/app.module.ts"), /provide:\s*APP_GUARD[\s\S]*useClass:\s*AuthGuard/);
assert.match(read("backend/api/src/auth/auth.guard.ts"), /getAllAndOverride[\s\S]*IS_PUBLIC_ROUTE/);
assert.match(read("backend/api/src/auth/jose-token-verifier.ts"), /jwtVerify[\s\S]*issuer:[\s\S]*audience:/);
assert.match(read("backend/api/src/bootstrap.ts"), /whitelist:\s*true/);
assert.match(read("backend/api/src/bootstrap.ts"), /forbidNonWhitelisted:\s*true/);
assert.match(read("backend/api/src/bootstrap.ts"), /AHA_ALLOWED_ORIGINS|allowedOrigins/);

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
assert.match(health, /canonicalSchema:\s*"not_connected"/);

const authContext = read("backend/api/src/auth-context.controller.ts");
assert.doesNotMatch(authContext, /@Public\(\)/);
assert.match(authContext, /subject:[\s\S]*provider:[\s\S]*issuer:[\s\S]*audience:/);
assert.doesNotMatch(authContext, /token|email|metadata/i);

const config = read("backend/api/src/config/app-config.ts");
assert.match(config, /AHA auth configuration is required in production/);
assert.match(config, /AHA_ALLOWED_ORIGINS is required in production/);
assert.match(config, /cannot contain a wildcard/);
assert.match(config, /at least 32 characters in production/);

const workflow = read(".github/workflows/aha-nestjs-api-tests.yml");
assert.match(workflow, /working-directory:\s*backend\/api/);
assert.match(workflow, /node-version:\s*22/);
assert.match(workflow, /npm install --package-lock-only/);
assert.match(workflow, /npm ci --ignore-scripts/);
assert.match(workflow, /npm run build/);
assert.match(workflow, /node --test test\/\*\.test\.mjs/);
assert.match(workflow, /Upload generated lockfile/);

const rootPackage = JSON.parse(read("package.json"));
assert.equal(rootPackage.main, "server.js");
assert.equal(rootPackage.scripts.start, "node server.js");
assert.doesNotMatch(read("server.js"), /backend\/api|aha-nest-api/);
assert.doesNotMatch(read("render.yaml"), /rootDir:\s*backend\/api|name:\s*aha-nest-api/);

assert.match(read("backend/api/README.md"), /ikke aktiv AHA-runtime/i);
assert.match(read("backend/api/README.md"), /ingen databaseklient|databaseklient eller runtime-grants/i);
assert.match(read("backend/api/README.md"), /NestJS command boundary|non-owner/i);

console.log("aha-nestjs-api-foundation.test.cjs passed");
