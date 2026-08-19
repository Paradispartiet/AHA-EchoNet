import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { ApiException } from "../api/api-exception.js";
import type { FysenAuthorizationExchangeRequestDto, FysenAuthorizationRequestDto } from "./fysen-authorization.dto.js";
import { FYSEN_INTEGRATION_CONFIG, type FysenIntegrationConfig } from "./fysen-integration.config.js";

const SCOPES = Object.freeze(["fysen:min_mat", "fysen:analysis_handoff"] as const);

interface AuthorizationPayload {
  v: 1;
  purpose: "fysen_connection";
  authorizationId: string;
  subject: string;
  provider: string;
  clientId: "fysen";
  redirectUri: string;
  codeChallenge: string;
  scopes: readonly ["fysen:min_mat", "fysen:analysis_handoff"];
  policyVersion: "aha_fysen_connection_v1";
  iat: number;
  exp: number;
}

@Injectable()
export class FysenAuthorizationService {
  constructor(@Inject(FYSEN_INTEGRATION_CONFIG) private readonly config: FysenIntegrationConfig) {}

  issue(principal: AuthPrincipal, input: FysenAuthorizationRequestDto) {
    this.assertEnabled();
    const redirectUri = this.allowedRedirect(input.redirectUri);
    const now = Math.floor(Date.now() / 1000);
    const payload: AuthorizationPayload = {
      v: 1,
      purpose: "fysen_connection",
      authorizationId: randomUUID(),
      subject: principal.subject,
      provider: principal.provider,
      clientId: "fysen",
      redirectUri,
      codeChallenge: input.codeChallenge,
      scopes: SCOPES,
      policyVersion: this.config.policyVersion,
      iat: now,
      exp: now + this.config.authorizationTtlSeconds
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = this.sign(encoded);
    return Object.freeze({
      authorizationCode: `${encoded}.${signature}`,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      policyVersion: payload.policyVersion,
      scopes: [...payload.scopes],
      dataShared: false,
      nextAction: "return_short_lived_code_to_fysen"
    });
  }

  exchange(input: FysenAuthorizationExchangeRequestDto) {
    this.assertEnabled();
    const redirectUri = this.allowedRedirect(input.redirectUri);
    const payload = this.verifySignedCode(input.authorizationCode);
    const now = Math.floor(Date.now() / 1000);
    const expectedChallenge = pkceChallenge(input.codeVerifier);
    const matches = payload.v === 1
      && payload.purpose === "fysen_connection"
      && payload.clientId === input.clientId
      && payload.redirectUri === redirectUri
      && safeEqual(payload.codeChallenge, expectedChallenge)
      && payload.policyVersion === this.config.policyVersion
      && Array.isArray(payload.scopes)
      && payload.scopes.length === SCOPES.length
      && SCOPES.every((scope, index) => payload.scopes[index] === scope)
      && Number.isInteger(payload.iat)
      && Number.isInteger(payload.exp)
      && payload.exp >= now
      && payload.exp - payload.iat <= this.config.authorizationTtlSeconds
      && typeof payload.authorizationId === "string"
      && payload.authorizationId.length >= 8
      && typeof payload.subject === "string"
      && payload.subject.length > 0
      && typeof payload.provider === "string"
      && payload.provider.length > 0;

    if (!matches) throw invalidAuthorization();

    return Object.freeze({
      authorizationId: payload.authorizationId,
      subject: payload.subject,
      provider: payload.provider,
      scopes: [...payload.scopes],
      policyVersion: payload.policyVersion,
      expiresAt: new Date(payload.exp * 1000).toISOString()
    });
  }

  private verifySignedCode(code: string): AuthorizationPayload {
    const [encoded, suppliedSignature, ...rest] = String(code || "").split(".");
    if (!encoded || !suppliedSignature || rest.length) throw invalidAuthorization();
    const expectedSignature = this.sign(encoded);
    if (!safeEqual(suppliedSignature, expectedSignature)) throw invalidAuthorization();
    try {
      const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      return parsed as AuthorizationPayload;
    } catch {
      throw invalidAuthorization();
    }
  }

  private sign(encodedPayload: string): string {
    const secret = this.config.authorizationSecret;
    if (!secret) throw disabled();
    return createHmac("sha256", secret).update(encodedPayload, "utf8").digest("base64url");
  }

  private allowedRedirect(value: string): string {
    let normalized: string;
    try {
      normalized = new URL(String(value || "").trim()).toString();
    } catch {
      throw new ApiException(400, "FYSEN_REDIRECT_INVALID", "The Fysen redirect URI is invalid");
    }
    if (!this.config.allowedRedirectUris.includes(normalized)) {
      throw new ApiException(400, "FYSEN_REDIRECT_NOT_ALLOWED", "The Fysen redirect URI is not allowlisted");
    }
    return normalized;
  }

  private assertEnabled(): void {
    if (!this.config.enabled || !this.config.authorizationSecret) throw disabled();
  }
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

function safeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(String(leftValue || ""), "utf8");
  const right = Buffer.from(String(rightValue || ""), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function disabled(): ApiException {
  return new ApiException(503, "FYSEN_INTEGRATION_DISABLED", "Fysen integration is not enabled");
}

function invalidAuthorization(): ApiException {
  return new ApiException(409, "FYSEN_AUTHORIZATION_INVALID", "The Fysen authorization is invalid or expired");
}
