// server/ahaInsightSynthesisEndpointV2.js
// Testable shadow-only HTTP handler for Interpretation / Insight Synthesis V2.

import {
  SYNTHESIS_OUTPUT_SCHEMA,
  SYNTHESIS_MAX_SOURCE_CHARS,
  buildSynthesisResponsesRequest,
  requireValidSynthesisPayload,
  buildSynthesisResponseEnvelope
} from "./ahaInsightSynthesisContractV2.js";

function synthesisFailurePolicy() {
  return {
    source_text_returned: false,
    raw_model_output_returned: false,
    shadow_synthesis_generated: false,
    production_gate_authority: false,
    synthesis_allowed: false,
    canonical_write: false,
    chamber_write: false,
    persistent_write: false,
    meta_write: false
  };
}

function sendJson(res, status, body) {
  if (typeof res.status === "function") res.status(status);
  return res.json(body);
}

function safeValidationErrors(error) {
  const errors = Array.isArray(error?.validation?.errors) ? error.validation.errors : [];
  return errors.map((item) => String(item || "").slice(0, 180)).filter(Boolean).slice(0, 32);
}

function synthesisErrorBody(error, extra = {}) {
  return Object.assign({
    ok: false,
    error,
    policy: synthesisFailurePolicy()
  }, extra);
}

function createInsightSynthesisHandlerV2({ openai, model, hasOpenAIKey } = {}) {
  return async function insightSynthesisHandlerV2(req, res) {
    if (!hasOpenAIKey || !openai) {
      return sendJson(res, 503, synthesisErrorBody("missing_openai_api_key"));
    }
    if (!openai.responses || typeof openai.responses.create !== "function") {
      return sendJson(res, 503, synthesisErrorBody("insight_synthesis_responses_unavailable"));
    }

    const body = req?.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    if (body.format != null && body.format !== SYNTHESIS_OUTPUT_SCHEMA) {
      return sendJson(res, 400, synthesisErrorBody("invalid_insight_synthesis_format", {
        expected_format: SYNTHESIS_OUTPUT_SCHEMA
      }));
    }
    if (typeof body.text !== "string" || !body.text.trim()) {
      return sendJson(res, 400, synthesisErrorBody("invalid_text"));
    }
    if (body.text.length > SYNTHESIS_MAX_SOURCE_CHARS) {
      return sendJson(res, 400, synthesisErrorBody("text_too_long", {
        limit: SYNTHESIS_MAX_SOURCE_CHARS
      }));
    }
    if (!body.semantic_context || typeof body.semantic_context !== "object" || Array.isArray(body.semantic_context)) {
      return sendJson(res, 400, synthesisErrorBody("invalid_semantic_context"));
    }
    if (body.context != null && (typeof body.context !== "object" || Array.isArray(body.context))) {
      return sendJson(res, 400, synthesisErrorBody("invalid_context"));
    }

    const sourceText = body.text;
    let request;
    try {
      request = buildSynthesisResponsesRequest({
        model,
        sourceText,
        semanticContext: body.semantic_context,
        context: body.context || {}
      });
    } catch (error) {
      return sendJson(res, 400, synthesisErrorBody("invalid_insight_synthesis_request", {
        reason: String(error?.message || "invalid_request").slice(0, 180),
        validation_errors: safeValidationErrors(error)
      }));
    }

    let response;
    try {
      response = await openai.responses.create(request);
    } catch (error) {
      return sendJson(res, 502, synthesisErrorBody("insight_synthesis_openai_error", {
        status: error?.status || error?.code || null
      }));
    }

    const rawPayload = response?.output_parsed && typeof response.output_parsed === "object"
      ? response.output_parsed
      : response?.output_text;

    let synthesis;
    try {
      synthesis = requireValidSynthesisPayload(rawPayload, sourceText);
    } catch (error) {
      return sendJson(res, 502, synthesisErrorBody("insight_synthesis_validation_failed", {
        validation_errors: safeValidationErrors(error)
      }));
    }

    return sendJson(res, 200, buildSynthesisResponseEnvelope({
      synthesis,
      model: response?.model || model,
      responseId: response?.id || null
    }));
  };
}

export {
  synthesisFailurePolicy,
  synthesisErrorBody,
  createInsightSynthesisHandlerV2
};
