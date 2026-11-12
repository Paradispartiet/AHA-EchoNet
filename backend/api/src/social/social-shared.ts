import { Injectable } from "@nestjs/common";
import { ApiException } from "../api/api-exception.js";
import { CanonicalDatabaseError } from "../database/database.errors.js";

type Kind = "feed" | "insta";

@Injectable()
export class SocialGate {
  assertEnabled(): void {
    // Staging-only: production is blocked independently of all other AHA flags.
    if (process.env.NODE_ENV === "production" || process.env.AHA_SOCIAL_STAGING_ENABLED !== "true") {
      throw new ApiException(503, "SOCIAL_DISABLED", "AHA social publishing is not enabled");
    }
  }

  assertMedia(kind: Kind, mediaUrl?: string): string | null {
    if (kind === "insta" && !mediaUrl) {
      throw new ApiException(400, "VALIDATION_FAILED", "An Insta post requires hosted media");
    }
    if (!mediaUrl) return null;
    // The staging upload API returns a relative reference. It is NOT an
    // external URL; SQL separately verifies that the authenticated author
    // owns the private media record before attaching it to a published post.
    if (/^\/v1\/social\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaUrl)) {
      return mediaUrl.toLowerCase();
    }
    if (mediaUrl.startsWith("/")) {
      throw new ApiException(400, "VALIDATION_FAILED", "Invalid internal AHA media reference");
    }
    let url: URL;
    try { url = new URL(mediaUrl); }
    catch { throw new ApiException(400, "VALIDATION_FAILED", "Invalid media URL"); }
    const allowed = String(process.env.AHA_SOCIAL_MEDIA_ORIGINS || "")
      .split(",").map((value) => value.trim()).filter(Boolean);
    if (url.protocol !== "https:" || url.username || url.password || !allowed.includes(url.origin)) {
      throw new ApiException(400, "VALIDATION_FAILED", "Media must use an approved HTTPS host");
    }
    return url.href;
  }
}

// Exact PostgreSQL error-to-HTTP mapping for the separate social contract.
// All other DB exceptions remain sanitized by the existing canonical error filter.
export function mapSocialDatabaseError(error: unknown): never {
  if (error instanceof CanonicalDatabaseError) {
    const cause: unknown = error.cause;
    if (cause && typeof cause === "object") {
      const pgError = cause as { code?: unknown; message?: unknown };
      const pgCode = String(pgError.code || "");
      const message = String(pgError.message || "").trim();
      if (pgCode === "42501" && message === "social moderator required") {
        throw new ApiException(403, "FORBIDDEN", "Moderator access is required");
      }
      if (pgCode === "42501" && message === "no open social reports") {
        throw new ApiException(409, "CONFLICT", "There are no pending reports to moderate");
      }
      if (pgCode === "42501" && (message === "post unavailable" || message === "media unavailable")) {
        throw new ApiException(404, "NOT_FOUND", "The post is not available");
      }
      if (pgCode === "23505" && (message === "idempotency conflict" || message === "media idempotency conflict")) {
        throw new ApiException(409, "CONFLICT", "This publication key was already used for different content");
      }
      if (pgCode === "22023" && ["publication rate limit", "comment rate limit", "media rate limit"].includes(message)) {
        throw new ApiException(429, "SOCIAL_RATE_LIMITED", "Too many recent social actions");
      }
      if (pgCode === "22023" && [
        "invalid social publication", "invalid comment", "invalid report reason",
        "invalid social feed request", "invalid like action", "invalid social moderation request",
        "invalid social media upload", "invalid social media signature"
      ].includes(message)) {
        throw new ApiException(400, "VALIDATION_FAILED", "The social request is invalid");
      }
    }
  }
  throw error;
}

