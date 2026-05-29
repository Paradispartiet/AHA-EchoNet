const { readFileSync } = require('node:fs');
const path = require('node:path');

const { buildComparison, canonicalFields } = require('./compare-aha-engine-fixtures.cjs');

const repoRoot = path.resolve(__dirname, '..');
const baselinePath = path.join(repoRoot, 'docs', 'reports', 'aha-engine-fixture-comparison-baseline.json');

const STATUS_RANK = {
  match: 3,
  partial: 2,
  not_checked: 1,
  mismatch: 0,
};

function loadBaseline() {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (!Array.isArray(baseline.fixtures)) {
    throw new Error('Baseline must contain a fixtures array.');
  }
  if (!Array.isArray(baseline.monitoredFields)) {
    throw new Error('Baseline must contain a monitoredFields array.');
  }
  return baseline;
}

function validateStatus(status, context) {
  if (!Object.prototype.hasOwnProperty.call(STATUS_RANK, status)) {
    throw new Error(`Unknown comparison status "${status}" in ${context}.`);
  }
}

function validateBaseline(baseline) {
  const monitoredFields = baseline.monitoredFields;
  const expectedFields = new Set(canonicalFields);
  const missingFields = canonicalFields.filter((field) => !monitoredFields.includes(field));
  const unknownFields = monitoredFields.filter((field) => !expectedFields.has(field));

  if (missingFields.length > 0 || unknownFields.length > 0) {
    throw new Error(`Baseline monitored fields mismatch. Missing: ${missingFields.join(', ') || 'none'}. Unknown: ${unknownFields.join(', ') || 'none'}.`);
  }

  if (baseline.fixtures.length !== 16) {
    throw new Error(`Expected 16 baseline fixtures, found ${baseline.fixtures.length}.`);
  }

  const seenIds = new Set();
  for (const fixture of baseline.fixtures) {
    if (!fixture.id || !fixture.group || !fixture.minimumStatuses) {
      throw new Error('Every baseline fixture must contain id, group, and minimumStatuses.');
    }
    if (seenIds.has(fixture.id)) {
      throw new Error(`Duplicate baseline fixture id: ${fixture.id}.`);
    }
    seenIds.add(fixture.id);

    if (!['baseline', 'next-phase'].includes(fixture.group)) {
      throw new Error(`Unexpected group for ${fixture.id}: ${fixture.group}.`);
    }

    for (const field of monitoredFields) {
      if (!Object.prototype.hasOwnProperty.call(fixture.minimumStatuses, field)) {
        throw new Error(`Missing baseline status for ${fixture.id}.${field}.`);
      }
      validateStatus(fixture.minimumStatuses[field], `${fixture.id}.${field}`);
    }
  }
}

function checkRegression(baseline, rows) {
  const currentById = new Map(rows.map((row) => [row.id, row]));
  const regressions = [];
  const improvements = [];

  for (const baselineFixture of baseline.fixtures) {
    const current = currentById.get(baselineFixture.id);
    if (!current) {
      regressions.push({
        id: baselineFixture.id,
        field: '<fixture>',
        baselineStatus: 'present',
        currentStatus: 'missing',
      });
      continue;
    }

    if (current.group !== baselineFixture.group) {
      regressions.push({
        id: baselineFixture.id,
        field: '<group>',
        baselineStatus: baselineFixture.group,
        currentStatus: current.group,
      });
    }

    for (const field of baseline.monitoredFields) {
      const baselineStatus = baselineFixture.minimumStatuses[field];
      const currentStatus = current.fields[field];
      validateStatus(currentStatus, `${baselineFixture.id}.${field}`);

      const baselineRank = STATUS_RANK[baselineStatus];
      const currentRank = STATUS_RANK[currentStatus];
      if (currentRank < baselineRank) {
        regressions.push({ id: baselineFixture.id, field, baselineStatus, currentStatus });
      } else if (currentRank > baselineRank) {
        improvements.push({ id: baselineFixture.id, field, baselineStatus, currentStatus });
      }
    }
  }

  const baselineIds = new Set(baseline.fixtures.map((fixture) => fixture.id));
  const unexpectedRows = rows.filter((row) => !baselineIds.has(row.id));
  for (const row of unexpectedRows) {
    regressions.push({
      id: row.id,
      field: '<fixture>',
      baselineStatus: 'missing',
      currentStatus: 'present',
    });
  }

  return { regressions, improvements };
}

function main() {
  const baseline = loadBaseline();
  validateBaseline(baseline);

  const { rows } = buildComparison();
  const { regressions, improvements } = checkRegression(baseline, rows);

  console.log(`AHA Engine comparison regression gate`);
  console.log(`Baseline: ${path.relative(repoRoot, baselinePath)}`);
  console.log(`Checked fixtures: ${baseline.fixtures.length}`);
  console.log(`Monitored fields: ${baseline.monitoredFields.join(', ')}`);

  if (regressions.length > 0) {
    console.error(`❌ Found ${regressions.length} AHA Engine comparison regression(s):`);
    for (const regression of regressions) {
      console.error(`- ${regression.id} / ${regression.field}: baseline=${regression.baselineStatus}, current=${regression.currentStatus}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`✅ No AHA Engine comparison regressions found.`);
  if (improvements.length > 0) {
    console.log(`ℹ️ Improvements above baseline: ${improvements.length}`);
    for (const improvement of improvements) {
      console.log(`- ${improvement.id} / ${improvement.field}: baseline=${improvement.baselineStatus}, current=${improvement.currentStatus}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`❌ AHA Engine comparison regression check failed: ${error.message}`);
  process.exitCode = 1;
}
