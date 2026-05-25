import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../docs/fixtures/aha-analysis');

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function addError(errors, fileName, fieldPath, message) {
  errors.push(`${fileName}:${fieldPath} ${message}`);
}

function validateArrayOfNonEmptyStrings(value, fileName, fieldPath, errors) {
  if (!Array.isArray(value)) {
    addError(errors, fileName, fieldPath, 'must be an array');
    return;
  }

  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) {
      addError(errors, fileName, `${fieldPath}[${index}]`, 'must be a non-empty string');
    }
  });
}

function validateConfidence(value, fileName, fieldPath, errors) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    addError(errors, fileName, fieldPath, 'must be an object');
    return;
  }

  const requiredConfidenceFields = [
    'contentType',
    'domain',
    'theme',
    'mainTension',
    'historyGoLinks',
  ];

  for (const key of requiredConfidenceFields) {
    const score = value[key];
    const scorePath = `${fieldPath}.${key}`;

    if (typeof score !== 'number' || Number.isNaN(score)) {
      addError(errors, fileName, scorePath, 'must be a number between 0 and 1');
      continue;
    }

    if (score < 0 || score > 1) {
      addError(errors, fileName, scorePath, 'must be between 0 and 1');
    }
  }
}

function validateHistoryGoLinks(value, fileName, fieldPath, errors) {
  if (!Array.isArray(value)) {
    addError(errors, fileName, fieldPath, 'must be an array');
    return;
  }

  value.forEach((item, index) => {
    const itemPath = `${fieldPath}[${index}]`;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      addError(errors, fileName, itemPath, 'must be an object');
      return;
    }

    for (const key of ['type', 'id', 'title', 'reason']) {
      if (!isNonEmptyString(item[key])) {
        addError(errors, fileName, `${itemPath}.${key}`, 'must be a non-empty string');
      }
    }
  });
}

function validateExpectedCanonicalAnalysis(value, fileName, errors) {
  const fieldPath = 'expectedCanonicalAnalysis';

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    addError(errors, fileName, fieldPath, 'must be an object');
    return;
  }

  for (const key of ['contentType', 'domain', 'theme', 'mainTension', 'keyInsight']) {
    if (!isNonEmptyString(value[key])) {
      addError(errors, fileName, `${fieldPath}.${key}`, 'must be a non-empty string');
    }
  }

  validateArrayOfNonEmptyStrings(value.fieldConnections, fileName, `${fieldPath}.fieldConnections`, errors);
  validateHistoryGoLinks(value.historyGoLinks, fileName, `${fieldPath}.historyGoLinks`, errors);
  validateArrayOfNonEmptyStrings(value.suggestedActions, fileName, `${fieldPath}.suggestedActions`, errors);
  validateConfidence(value.confidence, fileName, `${fieldPath}.confidence`, errors);
  validateArrayOfNonEmptyStrings(value.warnings, fileName, `${fieldPath}.warnings`, errors);
}

function validateFixture(data, fileName, errors) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    addError(errors, fileName, 'root', 'must be an object');
    return;
  }

  for (const key of ['id', 'title', 'inputText']) {
    if (!isNonEmptyString(data[key])) {
      addError(errors, fileName, key, 'must be a non-empty string');
    }
  }

  validateExpectedCanonicalAnalysis(data.expectedCanonicalAnalysis, fileName, errors);
}

async function main() {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();

  const errors = [];

  for (const fileName of jsonFiles) {
    const filePath = path.join(fixturesDir, fileName);

    let parsed;
    try {
      const raw = await readFile(filePath, 'utf8');
      parsed = JSON.parse(raw);
    } catch (error) {
      addError(errors, fileName, 'json', `is not valid JSON (${error.message})`);
      continue;
    }

    validateFixture(parsed, fileName, errors);
  }

  if (errors.length > 0) {
    console.error(`❌ AHA fixture validation failed with ${errors.length} error(s):`);
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Validated ${jsonFiles.length} AHA analysis fixtures in docs/fixtures/aha-analysis.`);
}

main().catch((error) => {
  console.error(`❌ Validation script failed: ${error.message}`);
  process.exitCode = 1;
});
