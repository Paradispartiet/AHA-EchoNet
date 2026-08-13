const assert = require('node:assert/strict');
const fs = require('node:fs');
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

assert.match(activateTools, /export PATH=/);
assert.match(launcher, /ensure-gh\.sh/);
assert.match(agentInstructions, /Never conclude that this repository lacks GitHub CLI/);
assert.match(agentInstructions, /source \.devcontainer\/activate-tools\.sh/);

const version = execFileSync('bash', ['scripts/gh', '--version'], { encoding: 'utf8' });
assert.match(version, /^gh version \d+\.\d+\.\d+/m);

console.log('aha-github-cli-bootstrap.test.cjs passed');
