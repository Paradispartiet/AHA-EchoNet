import { Inject, Injectable } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import type { AuthPrincipal, TokenVerifier } from "./auth.types.js";

@Injectable()
export class JoseTokenVerifier implements TokenVerifier {
  private keySet: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async verify(token: string): Promise<AuthPrincipal> {
    const auth = this.config.auth;
    if (!auth) {
      throw new Error("auth_not_configured");
    }

    this.keySet ??= createRemoteJWKSet(new URL(auth.jwksUrl), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000
    });

    const { payload, protectedHeader } = await jwtVerify(token, this.keySet, {
      issuer: auth.issuer,
      audience: auth.audience,
      algorithms: ["RS256", "ES256", "EdDSA"],
      clockTolerance: 5
    });

    if (!protectedHeader.kid) {
      throw new Error("jwt_kid_missing");
    }
    if (!payload.sub || typeof payload.sub !== "string") {
      throw new Error("jwt_subject_missing");
    }

    return Object.freeze({
      subject: payload.sub,
      provider: auth.provider,
      issuer: auth.issuer,
      audience: Object.freeze([auth.audience])
    });
  }
}
