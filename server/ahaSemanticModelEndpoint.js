// server/ahaSemanticModelEndpoint.js
// Testable HTTP handler for the source-direct Semantic Model V1 endpoint.

import {
  SEMANTIC_MODEL_SCHEMA,
  SEMANTIC_MODEL_MAX_SOURCE_CHARS,
  buildSemanticModelResponsesRequest,
  requireValidSemanticModelPayload,
  buildSemanticModelResponseEnvelope
} from "./ahaSemanticModelContract.js";

function failurePolicy() {
  return {
    source_text_returned: false,
    raw_model_output_returned: false,
    canonical_write: false,
    persistent_write: false,
    meta_write: false,
    synthesis_allowed: false
  };
}

function sendJson(res, status, body) {
  if (typeof res.status === "function") res.status(status);
  return res.json(body);
}

function safeValidationErrors(error) {
  const errors = Array.isArray(error?.validation?.errors) ? error.validation.errors : [];
  return errors
    .map((item) => String(item || "").slice(0, 180))
    .filter(Boolean)
    .slice(0, 24);
}

function semanticModelErrorBody(error, extra = {}) {
  return Object.assign({
    ok: false,
    error,
    policy: failurePolicy()
  }, extra);
}

function createSemanticModelHandler({ openai, model, hasOpenAIKey } = {}) {
  return async function semanticModelHandler(req, res) {
    if (!hasOpenAIKey || !openai) {
      return sendJson(res, 503, semanticModelErrorBody("missing_openai_api_key"));
    }
    if (!openai.responses || typeof openai.responses.create !== "function") {
      return sendJson(res, 503, semanticModelErrorBody("semantic_model_responses_unavailable"));
    }

    const body = req?.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    if (body.format != null && body.format !== SEMANTIC_MODEL_SCHEMA) {
      return sendJson(res, 400, semanticModelErrorBody("invalid_semantic_model_format", {
        expected_format: SEMANTIC_MODEL_SCHEMA
      }));
    }
    if (typeof body.text !== "string" || !body.text.trim()) {
      return sendJson(res, 400, semanticModelErrorBody("invalid_text"));
    }
    if (body.text.length > SEMANTIC_MODEL_MAX_SOURCE_CHARS) {
      return sendJson(res, 400, semanticModelErrorBody("text_too_long", {
        limit: SEMANTIC_MODEL_MAX_SOURCE_CHARS
      }));
    }
    if (body.context != null && (typeof body.context !== "object" || Array.isArray(body.context))) {
      return sendJson(res, 400, semanticModelErrorBody("invalid_context"));
    }

    const sourceText = body.text;
    let request;
    try {
      request = buildSemanticModelResponsesRequest({
        model,
        sourceText,
        context: body.context || {}
      });
    } catch (error) {
      return sendJson(res, 400, semanticModelErrorBody("invalid_semantic_model_request", {
        reason: String(error?.message || "invalid_request").slice(0, 180)
      }));
    }

    let response;
    try {
      response = await openai.responses.create(request);
    } catch (error) {
      return sendJson(res, 502, semanticModelErrorBody("semantic_model_openai_error", {
        status: error?.status || error?.code || null
      }));
    }

    const rawPayload = response?.output_parsed && typeof response.output_parsed === "object"
      ? response.output_parsed
      : response?.output_text;

    let analysis;
    try {
      analysis = requireValidSemanticModelPayload(rawPayload, sourceText);
    } catch (error) {
      return sendJson(res, 502, semanticModelErrorBody("semantic_model_validation_failed", {
        validation_errors: safeValidationErrors(error)
      }));
    }

    return sendJson(res, 200, buildSemanticModelResponseEnvelope({
      analysis,
      model: response?.model || model,
      responseId: response?.id || null
    }));
  };
}

export {
  failurePolicy,
  semanticModelErrorBody,
  createSemanticModelHandler
};
