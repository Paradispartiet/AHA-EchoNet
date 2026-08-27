const COST_CONTROL_SCHEMA = "aha_insight_synthesis_cost_control_v1";
const COST_CONTROL_MODES = Object.freeze(["live_smoke", "live_release"]);

function resolveSynthesisCostControl(context, maximumAttempts) {
  const absoluteMaximum = Number(maximumAttempts);
  if (!Number.isInteger(absoluteMaximum) || absoluteMaximum < 1) {
    throw new TypeError("insight_synthesis_cost_control_invalid_server_maximum");
  }
  const raw = context?.cost_control;
  if (raw == null) {
    return {
      requested: false,
      schema: COST_CONTROL_SCHEMA,
      mode: "standard",
      budget_id: null,
      synthesis_validation_attempt_limit: absoluteMaximum
    };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("insight_synthesis_cost_control_must_be_object");
  }
  const allowed = new Set(["schema", "mode", "budget_id", "synthesis_validation_attempt_limit"]);
  const unexpected = Object.keys(raw).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new TypeError(`insight_synthesis_cost_control_unexpected_keys:${unexpected.sort().join(",")}`);
  if (raw.schema !== COST_CONTROL_SCHEMA) throw new TypeError("insight_synthesis_cost_control_schema_invalid");
  if (!COST_CONTROL_MODES.includes(raw.mode)) throw new TypeError("insight_synthesis_cost_control_mode_invalid");
  const budgetId = String(raw.budget_id || "").trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,95}$/u.test(budgetId)) throw new TypeError("insight_synthesis_cost_control_budget_id_invalid");
  const attemptLimit = Number(raw.synthesis_validation_attempt_limit);
  if (!Number.isInteger(attemptLimit) || attemptLimit < 1 || attemptLimit > absoluteMaximum) {
    throw new TypeError("insight_synthesis_cost_control_attempt_limit_invalid");
  }
  return {
    requested: true,
    schema: COST_CONTROL_SCHEMA,
    mode: raw.mode,
    budget_id: budgetId,
    synthesis_validation_attempt_limit: attemptLimit
  };
}

function costControlEvidence(costControl, modelCallCount) {
  if (!costControl?.requested) return null;
  return {
    schema: COST_CONTROL_SCHEMA,
    mode: costControl.mode,
    budget_id: costControl.budget_id,
    synthesis_validation_attempt_limit: costControl.synthesis_validation_attempt_limit,
    model_call_count: Math.max(0, Number(modelCallCount) || 0)
  };
}

export {
  COST_CONTROL_SCHEMA,
  COST_CONTROL_MODES,
  resolveSynthesisCostControl,
  costControlEvidence
};
