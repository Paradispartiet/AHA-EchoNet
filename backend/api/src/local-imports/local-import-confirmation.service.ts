import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { ApiException } from "../api/api-exception.js";
import { LOCAL_IMPORT_CONFIG, type LocalImportConfig } from "./local-import.config.js";
import { sha256Hex, stableStringify } from "./local-import.hash.js";

interface ConfirmationTokenPayload {
  v: 1;
  purpose: "account_import";
  subject: string;
  provider: string;
  sourceKind: "aha_local_backup";
  sourceVersion: "v1";
  payloadHash: string;
  planHash: string;
  countsHash: string;
  workspaceScope: "personal";
  policyVersion: "aha_account_import_v1";
  iat: number;
  exp: number;
  nonce: string;
}

export interface ConfirmationDescriptor {
  sourceKind: "aha_local_backup";
  sourceVersion: "v1";
  payloadHash: string;
  planHash: string;
  counts: Record<string, number>;
}

@Injectable()
export class LocalImportConfirmationService {
  constructor(@Inject(LOCAL_IMPORT_CONFIG) private readonly config: LocalImportConfig) {}

  issue(principal: AuthPrincipal, descriptor: ConfirmationDescriptor): { token: string; expiresAt: string; policyVersion: string } {
    this.assertEnabled();
    const now = Math.floor(Date.now() / 1000);
    const payload: ConfirmationTokenPayload = {
      v: 1,
      purpose: "account_import",
      subject: principal.subject,
      provider: principal.provider,
      sourceKind: descriptor.sourceKind,
      sourceVersion: descriptor.sourceVersion,
      payloadHash: descriptor.payloadHash,
      planHash: descriptor.planHash,
      countsHash: sha256Hex(descriptor.counts),
      workspaceScope: "personal",
      policyVersion: this.config.policyVersion,
      iat: now,
      exp: now + this.config.confirmationTtlSeconds,
      nonce: randomUUID()
    };
    const encoded = Buffer.from(stableStringify(payload), "utf8").toString("base64url");
    const signature = this.sign(encoded);
    return {
      token: `${encoded}.${signature}`,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      policyVersion: payload.policyVersion
    };
  }

  verify(
    principal: AuthPrincipal,
    token: string,
    expected: Omit<ConfirmationDescriptor, "counts"> & { counts: Record<string, number> }
  ): ConfirmationTokenPayload {
    this.assertEnabled();
    const [encoded, suppliedSignature, ...rest] = String(token || "").split(".");
    if (!encoded || !suppliedSignature || rest.length) throw invalidConfirmation();
    const expectedSignature = this.sign(encoded);
    const left = Buffer.from(suppliedSignature, "utf8");
    const right = Buffer.from(expectedSignature, "utf8");
    if (left.length !== right.length || !timingSafeEqual(left, right)) throw invalidConfirmation();

    let payload: ConfirmationTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ConfirmationTokenPayload;
    } catch {
      throw invalidConfirmation();
    }

    const now = Math.floor(Date.now() / 1000);
    const matches = payload.v === 1
      && payload.purpose === "account_import"
      && payload.subject === principal.subject
      && payload.provider === principal.provider
      && payload.sourceKind === expected.sourceKind
      && payload.sourceVersion === expected.sourceVersion
      && payload.payloadHash === expected.payloadHash
      && payload.planHash === expected.planHash
      && payload.countsHash === sha256Hex(expected.counts)
      && payload.workspaceScope === "personal"
      && payload.policyVersion === this.config.policyVersion
      && Number.isInteger(payload.exp)
      && payload.exp >= now
      && payload.exp - payload.iat <= this.config.confirmationTtlSeconds;
    if (!matches) throw invalidConfirmation();
    return payload;
  }

  private sign(encodedPayload: string): string {
    const secret = this.config.confirmationSecret;
    if (!secret) throw new ApiException(503, "LOCAL_IMPORT_DISABLED", "Account import is not enabled");
    return createHmac("sha256", secret).update(encodedPayload, "utf8").digest("base64url");
  }

  private assertEnabled(): void {
    if (!this.config.enabled || !this.config.confirmationSecret) {
      throw new ApiException(503, "LOCAL_IMPORT_DISABLED", "Account import is not enabled");
    }
  }
}

function invalidConfirmation(): ApiException {
  return new ApiException(409, "IMPORT_CONFIRMATION_INVALID", "The import confirmation is invalid or expired");
}
