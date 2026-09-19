// Shared, fail-closed classification for OpenAI SDK failures.
// Do not expose provider messages or raw response bodies to clients.

function normalizedStatus(error) {
  const value = Number(error?.status ?? error?.error?.status);
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function normalizedProviderType(error) {
  const value = error?.type ?? error?.error?.type;
  return String(value || "").trim().slice(0, 80) || null;
}

function normalizedProviderCode(error) {
  const value = error?.code ?? error?.error?.code;
  return String(value || "").trim().slice(0, 80) || null;
}

function classifyOpenAIError(error, {
  defaultError = "openai_error",
  defaultHttpStatus = 502
} = {}) {
  const providerStatus = normalizedStatus(error);
  const providerType = normalizedProviderType(error);
  const providerCode = normalizedProviderCode(error);
  const quotaCodes = new Set([
    "insufficient_quota",
    "credit_balance_exhausted",
    "organization_usage_limit_exceeded",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded"
  ]);
  const quotaExhausted = providerStatus === 429
    && (quotaCodes.has(providerType) || quotaCodes.has(providerCode));

  if (quotaExhausted) {
    return {
      httpStatus: 429,
      error: "openai_quota_exhausted",
      status: providerStatus,
      type: providerType,
      code: providerCode,
      retryable: false
    };
  }

  if (providerStatus === 429) {
    return {
      httpStatus: 429,
      error: "openai_rate_limited",
      status: providerStatus,
      type: providerType,
      code: providerCode,
      retryable: true
    };
  }

  return {
    httpStatus: defaultHttpStatus,
    error: defaultError,
    status: providerStatus,
    type: providerType,
    code: providerCode,
    retryable: providerStatus == null || providerStatus >= 500
  };
}

export { classifyOpenAIError };
