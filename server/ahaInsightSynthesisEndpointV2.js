// server/ahaInsightSynthesisEndpointV2.js
// Testable shadow-only HTTP handler for Interpretation / Insight Synthesis V2.

import {
  SYNTHESIS_OUTPUT_SCHEMA,
  SYNTHESIS_MAX_SOURCE_CHARS,
  synthesisResponseRequirements,
  buildSynthesisResponsesRequest,
  requireValidSynthesisPayload,
  buildSynthesisResponseEnvelope
} from "./ahaInsightSynthesisContractV2.js";
import {
  MAX_VALIDATION_ATTEMPTS,
  applyStabilityRequestPolicy,
  validateStabilitySynthesis,
  addRetryInstruction
} from "./ahaInsightSynthesisStabilityV2.js";
import { buildRuntimeManifest } from "./ahaRuntimeManifest.js";
import { classifyOpenAIError } from "./ahaOpenAIError.js";
import {
  resolveSynthesisCostControl,
  costControlEvidence
} from "./ahaInsightSynthesisCostControlV1.js";

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
    let responseRequirements;
    let costControl;
    try {
      costControl = resolveSynthesisCostControl(body.context || {}, MAX_VALIDATION_ATTEMPTS);
      responseRequirements = synthesisResponseRequirements({
        context: body.context || {},
        semanticContext: body.semantic_context
      });
      request = applyStabilityRequestPolicy(buildSynthesisResponsesRequest({
        model,
        sourceText,
        semanticContext: body.semantic_context,
        context: body.context || {}
      }));
    } catch (error) {
      return sendJson(res, 400, synthesisErrorBody("invalid_insight_synthesis_request", {
        reason: String(error?.message || "invalid_request").slice(0, 180),
        validation_errors: safeValidationErrors(error)
      }));
    }

    let response = null;
    let synthesis = null;
    let lastValidationErrors = [];
    let successfulAttempt = 0;
    let modelCallCount = 0;
    const validationAttemptLimit = costControl.synthesis_validation_attempt_limit;

    for (let attempt = 1; attempt <= validationAttemptLimit; attempt += 1) {
      try {
        modelCallCount += 1;
        response = await openai.responses.create(request);
      } catch (error) {
        const providerError = classifyOpenAIError(error, {
          defaultError: "insight_synthesis_openai_error"
        });
        return sendJson(res, providerError.httpStatus, synthesisErrorBody(providerError.error, {
          status: providerError.status,
          type: providerError.type,
          retryable: providerError.retryable,
          cost_control: costControlEvidence(costControl, modelCallCount)
        }));
      }

      const rawPayload = response?.output_parsed && typeof response.output_parsed === "object"
        ? response.output_parsed
        : response?.output_text;

      try {
        synthesis = requireValidSynthesisPayload(rawPayload, sourceText, responseRequirements);
        lastValidationErrors = [];
      } catch (error) {
        synthesis = null;
        lastValidationErrors = safeValidationErrors(error);
      }

      if (synthesis) {
        const stability = validateStabilitySynthesis(synthesis, sourceText);
        if (stability.ok) {
          successfulAttempt = attempt;
          break;
        }
        lastValidationErrors = stability.errors.map((item) => String(item).slice(0, 180)).slice(0, 32);
        synthesis = null;
      }

      if (attempt < validationAttemptLimit) {
        request = addRetryInstruction(request, lastValidationErrors);
      }
    }

    if (!synthesis) {
      const blockedEnvelope = buildSynthesisResponseEnvelope({
        synthesis: { schema: SYNTHESIS_OUTPUT_SCHEMA, candidates: [] },
        model: response?.model || model,
        responseId: response?.id || null
      });
      blockedEnvelope.runtime = buildRuntimeManifest();
      blockedEnvelope.synthesis_attempts = modelCallCount;
      blockedEnvelope.validation_status = "blocked";
      blockedEnvelope.validation_errors = lastValidationErrors;
      if (costControl.requested) blockedEnvelope.cost_control = costControlEvidence(costControl, modelCallCount);
      return sendJson(res, 200, blockedEnvelope);
    }

    const envelope = buildSynthesisResponseEnvelope({
      synthesis,
      model: response?.model || model,
      responseId: response?.id || null
    });
    envelope.runtime = buildRuntimeManifest();
    envelope.synthesis_attempts = successfulAttempt;
    envelope.validation_status = "passed";
    if (costControl.requested) envelope.cost_control = costControlEvidence(costControl, modelCallCount);
    return sendJson(res, 200, envelope);
  };
}

export {
  synthesisFailurePolicy,
  synthesisErrorBody,
  createInsightSynthesisHandlerV2
};
