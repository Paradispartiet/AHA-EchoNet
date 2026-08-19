const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const devcontainer = JSON.parse(fs.readFileSync('.devcontainer/devcontainer.json', 'utf8'));
const ensureGh = fs.readFileSync('.devcontainer/ensure-gh.sh', 'utf8');
const activateTools = fs.readFileSync('.devcontainer/activate-tools.sh', 'utf8');
const launcher = fs.readFileSync('scripts/gh', 'utf8');
const agentInstructions = fs.readFileSync('AGENTS.md', 'utf8');

assert.ok(devcontainer.features['ghcr.io/devcontainers/features/github-cli:1'], 'official GitHub CLI devcontainer feature must stay enabled');
assert.equal(devcontainer.postStartCommand, 'bash .devcontainer/ensure-gh.sh');
assert.match(devcontainer.remoteEnv.PATH, /\/workspace\/bin/);

assert.match(ensureGh, /GH_FALLBACK_VERSION="\$\{AHA_GH_VERSION:-2\.94\.0\}"/);
assert.match(ensureGh, /GH_MINIMUM_VERSION="2\.92\.0"/);
assert.match(ensureGh, /sha256sum/);
assert.match(ensureGh, /tar --no-same-owner/);
assert.match(ensureGh, /github\.com\/cli\/cli\/releases\/download/);
assert.match(ensureGh, /\/workspace\/bin\/gh/);
assert.match(ensureGh, /repair_with_apt/);
assert.match(ensureGh, /install_local_release/);
assert.match(ensureGh, /--print-path/);

assert.match(activateTools, /export PATH=/);
assert.doesNotMatch(activateTools, /set -[A-Za-z]*[Eeuo]/);
assert.match(launcher, /ensure-gh\.sh/);
assert.match(launcher, /--print-path/);
assert.doesNotMatch(launcher, /command -v gh/);
assert.match(agentInstructions, /Never conclude that this repository lacks GitHub CLI/);
assert.match(agentInstructions, /source \.devcontainer\/activate-tools\.sh/);

const version = execFileSync('bash', ['scripts/gh', '--version'], { encoding: 'utf8' });
assert.match(version, /^gh version \d+\.\d+\.\d+/m);

// Keep this regression fully deterministic. The production repair script still
// contains and statically verifies the official APT + checksum-verified release
// fallbacks above, but this unit test must not depend on external package mirrors.
// It instead puts a stale gh first in PATH and exposes the already validated gh
// through the explicit local-bin contract. The launcher must reject stale PATH
// and resolve the supported fallback without contacting the network.
const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'aha-stale-gh-'));
const fakeGh = path.join(fakeBin, 'gh');
fs.writeFileSync(fakeGh, '#!/usr/bin/env bash\necho "gh version 1.0.0 (stale-test)"\n', { mode: 0o755 });

const supportedGh = execFileSync('bash', ['.devcontainer/ensure-gh.sh', '--print-path'], { encoding: 'utf8' }).trim();
const supportedBin = path.dirname(supportedGh);
const deterministicBin = fs.mkdtempSync(path.join(os.tmpdir(), 'aha-supported-gh-'));
const deterministicGh = path.join(deterministicBin, 'gh');
fs.symlinkSync(supportedGh, deterministicGh);

const remainingPath = String(process.env.PATH || '')
  .split(path.delimiter)
  .filter((entry) => entry && entry !== fakeBin && entry !== supportedBin && entry !== deterministicBin)
  .join(path.delimiter);

const staleEnvironment = {
  ...process.env,
  AHA_GH_BIN_DIR: deterministicBin,
  PATH: [fakeBin, deterministicBin, remainingPath].filter(Boolean).join(path.delimiter)
};
const repairedVersion = execFileSync('bash', ['scripts/gh', '--version'], {
  encoding: 'utf8',
  env: staleEnvironment
});
assert.match(repairedVersion, /^gh version (?!1\.0\.0)\d+\.\d+\.\d+/m, 'launcher must execute the validated fallback binary, not stale PATH gh');

const activationCheck = execFileSync('bash', ['-c', `
  set +e +u +E
  set +o pipefail
  source .devcontainer/activate-tools.sh >/dev/null
  first_path="$(command -v gh)"
  source .devcontainer/activate-tools.sh >/dev/null
  second_path="$(command -v gh)"
  case "$-" in *e*|*u*|*E*) exit 21 ;; esac
  [[ "$(set -o | awk '$1 == "pipefail" { print $2 }')" == "off" ]] || exit 22
  [[ "$first_path" == "$second_path" ]] || exit 23
  [[ "$(gh version | awk 'NR == 1 { print $3 }')" != "1.0.0" ]] || exit 24
`], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: staleEnvironment
});
assert.equal(activationCheck, '', 'activation must be quiet when redirected');

fs.rmSync(fakeBin, { recursive: true, force: true });
fs.rmSync(deterministicBin, { recursive: true, force: true });

console.log('aha-github-cli-bootstrap.test.cjs passed');
