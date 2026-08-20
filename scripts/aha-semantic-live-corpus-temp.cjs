const fs = require('fs');

const endpoint = 'https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document';
const corpus = JSON.parse(fs.readFileSync('tests/fixtures/aha-semantic-live-corpus-source-temp.json', 'utf8'));

function assertSafeEnvelope(body, id) {
  if (body?.ok !== true) throw new Error(`${id}: ok != true`);
  if (body?.schema !== 'aha_semantic_model_contract_v1') throw new Error(`${id}: wrong envelope schema`);
  if (body?.analysis?.schema !== 'aha_semantic_model_output_v1') throw new Error(`${id}: wrong analysis schema`);
  const policy = body?.policy || {};
  for (const key of ['source_text_returned', 'canonical_write', 'persistent_write', 'meta_write', 'synthesis_allowed']) {
    if (policy[key] !== false) throw new Error(`${id}: unsafe policy ${key}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'source_text')) throw new Error(`${id}: source_text leaked`);
  if (Object.prototype.hasOwnProperty.call(body, 'raw_model_output')) throw new Error(`${id}: raw_model_output leaked`);
}

async function postCase(item) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: item.text,
        format: 'aha_semantic_model_output_v1',
        context: {
          source_event_id: item.id,
          source_type: 'live_gold_qa',
          language: 'no'
        }
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        id: item.id,
        source_text: item.text,
        ok: false,
        http_status: response.status,
        error: String(body?.error || 'unknown'),
        validation_errors: Array.isArray(body?.validation_errors) ? body.validation_errors : [],
        policy: body?.policy || null
      };
    }
    assertSafeEnvelope(body, item.id);
    return {
      id: item.id,
      source_text: item.text,
      ok: true,
      http_status: response.status,
      model: body.model || null,
      response_id: body.response_id || null,
      analysis: body.analysis,
      policy: body.policy
    };
  } catch (error) {
    return {
      id: item.id,
      source_text: item.text,
      ok: false,
      http_status: null,
      error: String(error?.message || error),
      validation_errors: []
    };
  }
}

(async () => {
  const results = [];
  for (const item of corpus.cases) {
    const result = await postCase(item);
    results.push(result);
    if (!result.ok) {
      console.log(JSON.stringify({
        id: result.id,
        status: 'REJECTED',
        http_status: result.http_status,
        error: result.error,
        validation_error_count: result.validation_errors.length
      }));
      continue;
    }
    const a = result.analysis;
    console.log(JSON.stringify({
      id: result.id,
      status: 'PASS',
      model: result.model,
      entities: a.entities.length,
      concepts: a.concepts.length,
      propositions: a.propositions.length,
      relations: a.relations.length,
      unresolved_inferences: a.unresolved_inferences.length,
      synthesis_allowed: false
    }));
  }
  fs.mkdirSync('/tmp/aha-semantic-live-corpus', { recursive: true });
  fs.writeFileSync('/tmp/aha-semantic-live-corpus/results.json', JSON.stringify({
    schema: 'aha_semantic_live_capture_v1',
    captured_at: new Date().toISOString(),
    case_count: results.length,
    success_count: results.filter((item) => item.ok).length,
    rejected_count: results.filter((item) => !item.ok).length,
    results
  }, null, 2));
  console.log(`captured ${results.length} live semantic cases; success=${results.filter((item) => item.ok).length}; rejected=${results.filter((item) => !item.ok).length}`);
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
