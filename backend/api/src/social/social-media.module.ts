import {
  Controller, Get, Headers, Inject, Injectable, Module, Param, ParseUUIDPipe,
  Post, Req, Res
} from "@nestjs/common";
import type { Response } from "express";
import { apiSuccess } from "../api/api-contract.js";
import { ApiException } from "../api/api-exception.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import type { AhaRequest } from "../common/request-context.js";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { CanonicalDatabaseService } from "../database/canonical-database.service.js";
import { SocialGate, mapSocialDatabaseError } from "./social-shared.js";

export const MAX_SOCIAL_IMAGE_BYTES = 524288;
const MIN_IMAGE_BYTES = 100;
const MAX_IMAGE_EDGE = 2048;

function requirePrincipal(req: AhaRequest): AuthPrincipal {
  if (!req.principal) throw new ApiException(401, "AUTH_REQUIRED", "A valid bearer token is required");
  return req.principal;
}

/**
 * Defensive server-side parsing. Browser canvas exports PNG/WebP; original
 * camera bytes are never accepted directly, including SVG/HEIC/JPEG/MP4.
 * This is a staging quota, not production-grade malware/content scanning.
 */
export function validateStagingImage(mime: string, input: unknown): Buffer {
  if (mime !== "image/webp" && mime !== "image/png") {
    throw new ApiException(400, "VALIDATION_FAILED", "Only PNG or WebP staging images are supported");
  }
  if (!Buffer.isBuffer(input)) {
    throw new ApiException(400, "VALIDATION_FAILED", "A binary image body is required");
  }
  if (input.length > MAX_SOCIAL_IMAGE_BYTES) {
    throw new ApiException(413, "SOCIAL_MEDIA_TOO_LARGE", "Image exceeds the 512 KiB staging limit");
  }
  if (input.length < MIN_IMAGE_BYTES) {
    throw new ApiException(400, "VALIDATION_FAILED", "The image is too small or invalid");
  }

  let width = 0;
  let height = 0;
  if (mime === "image/png") {
    if (input.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
      || input.subarray(12, 16).toString("ascii") !== "IHDR") {
      throw new ApiException(400, "VALIDATION_FAILED", "Invalid PNG header");
    }
    width = input.readUInt32BE(16);
    height = input.readUInt32BE(20);
  } else {
    if (input.subarray(0, 4).toString("ascii") !== "RIFF"
      || input.subarray(8, 12).toString("ascii") !== "WEBP"
      || input.readUInt32LE(4) + 8 !== input.length) {
      throw new ApiException(400, "VALIDATION_FAILED", "Invalid WebP container");
    }
    const chunk = input.subarray(12, 16).toString("ascii");
    if (chunk === "VP8 ") {
      if (input.length < 30 || input.subarray(23, 26).toString("hex") !== "9d012a") {
        throw new ApiException(400, "VALIDATION_FAILED", "Invalid WebP frame");
      }
      width = input.readUInt16LE(26) & 0x3fff;
      height = input.readUInt16LE(28) & 0x3fff;
    } else if (chunk === "VP8L") {
      if (input.length < 25 || input[20] !== 0x2f) {
        throw new ApiException(400, "VALIDATION_FAILED", "Invalid lossless WebP frame");
      }
      const flags = input.readUInt32LE(21);
      width = (flags & 0x3fff) + 1;
      height = ((flags >>> 14) & 0x3fff) + 1;
    } else if (chunk === "VP8X") {
      if (input.length < 30) {
        throw new ApiException(400, "VALIDATION_FAILED", "Invalid extended WebP frame");
      }
      width = 1 + input.readUIntLE(24, 3);
      height = 1 + input.readUIntLE(27, 3);
    } else {
      throw new ApiException(400, "VALIDATION_FAILED", "Unknown WebP frame type");
    }
  }
  if (width < 1 || height < 1 || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
    throw new ApiException(400, "VALIDATION_FAILED", "Image dimensions are not within staging limits");
  }
  return input;
}

@Injectable()
export class SocialMediaRepository {
  constructor(private readonly database: CanonicalDatabaseService) {}

  async upload(
    principal: AuthPrincipal, mime: string, data: Buffer, requestKey: string
  ): Promise<Record<string, unknown>> {
    try {
      return await this.database.withCommandSession(principal, async client => {
        const response = await client.query<{ result: unknown }>(
          "select aha_social.upload_media_v1($1::text,$2::bytea,$3::text) as result",
          [mime, data, requestKey]
        );
        const value = response.rows[0]?.result;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("invalid_social_media_upload_response");
        }
        return value as Record<string, unknown>;
      });
    } catch (error) { return mapSocialDatabaseError(error); }
  }

  async read(principal: AuthPrincipal, id: string): Promise<{ contentType: string; bytes: Buffer }> {
    try {
      return await this.database.withReadSession(principal, async client => {
        const response = await client.query<{ content_type: string; bytes: Buffer }>(
          "select content_type,bytes from aha_social.read_media_v1($1::uuid)",
          [id]
        );
        const row = response.rows[0];
        if (!row || !Buffer.isBuffer(row.bytes) ||
            !["image/png","image/webp"].includes(row.content_type) ||
            row.bytes.length > MAX_SOCIAL_IMAGE_BYTES) {
          throw new Error("invalid_social_media_read_response");
        }
        return { contentType: row.content_type, bytes: row.bytes };
      });
    } catch (error) { return mapSocialDatabaseError(error); }
  }
}

@Injectable()
export class SocialMediaService {
  constructor(
    private readonly gate: SocialGate,
    private readonly repository: SocialMediaRepository
  ) {}

  async upload(principal: AuthPrincipal, mime: string, body: unknown, key: string) {
    this.gate.assertEnabled();
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
      throw new ApiException(400, "VALIDATION_FAILED", "A valid upload idempotency key is required");
    }
    const bytes = validateStagingImage(mime, body);
    return this.repository.upload(principal, mime, bytes, key);
  }

  async read(principal: AuthPrincipal, id: string) {
    this.gate.assertEnabled();
    return this.repository.read(principal, id);
  }
}

@Controller("v1/social")
export class SocialMediaController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly media: SocialMediaService
  ) {}

  @Post("media")
  async upload(
    @Req() request: AhaRequest,
    @Headers("content-type") contentType: string,
    @Headers("idempotency-key") requestKey: string
  ) {
    const mime = String(contentType || "").split(";")[0]?.trim().toLowerCase() || "";
    const result = await this.media.upload(requirePrincipal(request), mime, request.body, requestKey);
    return apiSuccess(request, this.config.serviceVersion, result);
  }

  @Get("media/:id")
  async read(@Req() request: AhaRequest, @Param("id", new ParseUUIDPipe()) id: string, @Res() response: Response) {
    const media = await this.media.read(requirePrincipal(request), id);
    response
      .status(200)
      .set("Content-Type", media.contentType)
      .set("Cache-Control", "private, no-store")
      .set("X-Content-Type-Options", "nosniff")
      .set("Content-Security-Policy", "default-src 'none'; sandbox")
      .send(media.bytes);
  }
}
