const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/ahaHistoryGoImportContract.js', 'utf8');
const schema = JSON.parse(fs.readFileSync('schemas/aha_import_payload_v1.schema.json', 'utf8'));
const readFixture = (name) => JSON.parse(fs.readFileSync(`docs/fixtures/historygo-import/${name}.json`, 'utf8'));

const context = { window: null, Date, JSON, Object, Array, Set, Number, String };
context.window = context;
vm.runInNewContext(source, context, { filename: 'js/ahaHistoryGoImportContract.js' });
const Contract = context.AHAHistoryGoImportContract;

assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.properties.schema_version.const, Contract.CONTRACT_ID);
assert.equal(schema.properties.contract_version.const, Contract.CONTRACT_VERSION);
assert.equal(schema.additionalProperties, false);
assert.deepEqual(Object.keys(schema.properties).sort(), Array.from(Contract.TOP_LEVEL_KEYS));
for (const key of Contract.REQUIRED_ARRAYS) assert.ok(schema.required.includes(key), `${key} must be required by schema`);

const valid = Contract.preparePayload(readFixture('valid-v1'));
assert.equal(valid.ok, true);
assert.equal(valid.migrated_from, null);

const legacy = Contract.preparePayload(readFixture('legacy-v0'));
assert.equal(legacy.ok, true);
assert.equal(legacy.migrated_from, Contract.LEGACY_VERSION);
assert.equal(legacy.payload.schema_version, Contract.CONTRACT_ID);
assert.deepEqual(Array.from(legacy.payload.hg_knowledge_entries_v2), []);
assert.equal(legacy.payload.privacy.public_sharing, false);

const future = Contract.preparePayload(readFixture('invalid-future-v2'));
assert.equal(future.ok, false);
assert.equal(future.errors[0].code, 'unsupported_contract_version');

const malformed = Contract.preparePayload(readFixture('invalid-v1-shape'));
assert.equal(malformed.ok, false);
assert.ok(malformed.errors.some((entry) => entry.code === 'invalid_exported_at'));
assert.ok(malformed.errors.some((entry) => entry.code === 'invalid_field_type'));
assert.ok(malformed.errors.some((entry) => entry.code === 'public_sharing_forbidden'));
assert.ok(malformed.errors.some((entry) => entry.code === 'model_training_forbidden'));

const unknown = Contract.preparePayload({ arbitrary: true });
assert.equal(unknown.ok, false);
assert.equal(unknown.errors[0].code, 'missing_schema_version');

const unknownField = Contract.preparePayload({ ...readFixture('valid-v1'), surprise: true });
assert.equal(unknownField.ok, false);
assert.equal(unknownField.errors[0].code, 'unknown_property');

const invalidItem = Contract.preparePayload({ ...readFixture('valid-v1'), notes: ['raw string'] });
assert.equal(invalidItem.ok, false);
assert.equal(invalidItem.errors[0].code, 'invalid_item_type');

console.log('aha-historygo-import-contract.test.cjs passed');
