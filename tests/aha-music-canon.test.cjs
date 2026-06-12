const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const read = (file) => fs.readFileSync(file, 'utf8');

const nodes = readJson('data/aha-music/canon/musicCanonNodes.json');
const edges = readJson('data/aha-music/canon/musicCanonEdges.json');
const schema = readJson('data/aha-music/canon/musicCanonSchema.json');
const html = read('music.html');
const css = read('css/aha-music.css');
const musicJs = read('js/ahaMusic.js');
const canonJs = read('js/ahaMusicCanon.js');
const readme = read('README.md');

assert.equal(nodes.length, 73, 'canon should include all 73 requested seed nodes');
assert.equal(edges.length, 30, 'canon should include all 30 requested seed edges');

for (const required of ['id', 'type', 'name', 'shortDescription', 'parentId', 'eraRange', 'region', 'tags', 'sortOrder']) {
  assert.ok(schema.$defs.canonNode.required.includes(required), `canon node schema should require ${required}`);
  assert.ok(nodes.every((node) => Object.prototype.hasOwnProperty.call(node, required)), `every node should include ${required}`);
  if (required === 'region') assert.ok(nodes.every((node) => typeof node.region === 'string' && node.region.length), 'every node region should be a non-empty string');
  if (required === 'tags') assert.ok(nodes.every((node) => Array.isArray(node.tags) && node.tags.every((tag) => typeof tag === 'string')), 'every node tags value should be an array of strings');
  if (required === 'eraRange') assert.ok(nodes.every((node) => node.eraRange === null || typeof node.eraRange === 'string'), 'every node eraRange should be string or null');
}

for (const required of ['id', 'fromNodeId', 'toNodeId', 'relationType', 'shortDescription', 'confidence']) {
  assert.ok(schema.$defs.canonEdge.required.includes(required), `canon edge schema should require ${required}`);
  assert.ok(edges.every((edge) => Object.prototype.hasOwnProperty.call(edge, required)), `every edge should include ${required}`);
}

for (const type of ['era', 'genre', 'tradition', 'rhythm', 'harmony', 'production', 'technology', 'instrument', 'cultural_context', 'science_concept', 'music_theory', 'movement']) {
  assert.ok(schema.$defs.canonNode.properties.type.enum.includes(type), `schema should allow node type ${type}`);
}

for (const relationType of ['developed_from', 'influenced', 'belongs_to', 'parallel_to', 'reaction_against', 'uses_technique', 'emerged_in', 'transformed_into']) {
  assert.ok(schema.$defs.canonEdge.properties.relationType.enum.includes(relationType), `schema should allow relationType ${relationType}`);
}

for (const id of [
  'ancient_music',
  'digital_music_age',
  'folk_music',
  'hip_hop',
  'studio_as_instrument',
  'internet_music_culture'
]) {
  assert.ok(nodes.some((node) => node.id === id), `canon should include seed node ${id}`);
}

const nodeIds = new Set(nodes.map((node) => node.id));
assert.equal(nodeIds.size, nodes.length, 'canon node ids should be unique');
for (const edge of edges) {
  assert.ok(nodeIds.has(edge.fromNodeId), `${edge.id} should reference an existing from node`);
  assert.ok(nodeIds.has(edge.toNodeId), `${edge.id} should reference an existing to node`);
}
assert.ok(edges.some((edge) => edge.fromNodeId === 'music_video_culture' && edge.toNodeId === 'pop' && edge.relationType === 'influenced'), 'canon should include the music video culture -> pop edge');
assert.ok(edges.some((edge) => edge.fromNodeId === 'sampling' && edge.toNodeId === 'hip_hop' && edge.relationType === 'uses_technique'), 'canon should include the sampling -> hip hop edge');

for (const text of [
  'aha-music-canon',
  'AHA Music Canon',
  'js/ahaMusicCanon.js',
  'Første kuraterte kanon-lag'
]) {
  assert.ok(html.includes(text), `music.html should expose ${text}`);
}

for (const text of ['Epoker', 'Sjangre og tradisjoner', 'Vitenskap og musikkteori', 'Kulturell kontekst', 'Påvirkningslinjer', 'Ingen sanger koblet ennå']) {
  assert.ok(canonJs.includes(text), `canon UI should render ${text}`);
}

for (const text of ['trackCanonNodes', 'artistCanonNodes', 'playlistCanonNodes']) {
  assert.ok(schema.properties[`${text.replace('Nodes', 'Links')}`] || musicJs.includes(text), `future link model should include ${text}`);
  assert.ok(musicJs.includes(text), `music library model should reserve ${text}`);
}

assert.ok(css.includes('.aha-music-canon-layout'), 'canon CSS should define the layout');
assert.ok(readme.includes('AHA Music Canon v1'), 'README should document canon v1');
assert.ok(readme.includes('track → canon nodes'), 'README should document future track canon links');

const sandbox = {
  window: {},
  document: { readyState: 'loading', addEventListener: () => {}, getElementById: () => null },
  fetch: async () => { throw new Error('not used in unit validation'); },
  console
};
sandbox.window = sandbox;
vm.runInNewContext(canonJs, sandbox, { filename: 'js/ahaMusicCanon.js' });
const validation = sandbox.AHAMusicCanon.validateCanonData({ nodes, edges });
assert.equal(validation.ok, true, `canon validation should pass: ${validation.errors.join('; ')}`);
assert.equal(validation.nodeCount, 73, 'validator should count nodes');
assert.equal(validation.edgeCount, 30, 'validator should count edges');
assert.equal(sandbox.AHAMusicCanon.relatedEdgesForNode('hip_hop', edges).incoming.length, 4, 'hip hop should expose incoming influence lines');

console.log('aha-music-canon.test.cjs passed');
