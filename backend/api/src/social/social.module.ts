import { Body, Controller, Delete, Get, Inject, Injectable, Module, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { Type } from "class-transformer";
import { Equals, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Length, Max, Min } from "class-validator";
import { apiSuccess } from "../api/api-contract.js";
import { ApiException } from "../api/api-exception.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import type { AhaRequest } from "../common/request-context.js";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { CanonicalDatabaseService } from "../database/canonical-database.service.js";
import { SocialModerationController, SocialModerationRepository, SocialModerationService } from "./social-moderation.module.js";
import { SocialGate, mapSocialDatabaseError } from "./social-shared.js";
import { SocialMediaController, SocialMediaRepository, SocialMediaService } from "./social-media.module.js";
export { SocialGate, mapSocialDatabaseError } from "./social-shared.js";

type Kind = "feed" | "insta";
type Result = Record<string, unknown> | Record<string, unknown>[];

export class SocialListQuery {
  @IsIn(["feed", "insta"])
  kind!: Kind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  limit = 20;
}

export class SocialPostInput {
  @IsIn(["feed", "insta"])
  kind!: Kind;

  @IsString()
  @Length(0, 2000)
  text!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  @Matches(/^(?:https:\/\/[^\s]+|\/v1\/social\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  mediaUrl?: string;

  @IsOptional()
  @IsIn(["feed", "reel", "map"])
  instaMode?: "feed" | "reel" | "map";

  @IsOptional()
  @IsString()
  @Length(1, 120)
  placeTag?: string;

  @IsString()
  @Length(8, 100)
  requestKey!: string;

  // Only explicit individual publication is allowed. Never import private posts.
  @Equals(true)
  publish!: true;
}

export class SocialLikeInput {
  @IsBoolean()
  liked!: boolean;
}

export class SocialPlaceTagInput {
  // Null explicitly removes an optional tag. Omission is not a write request.
  @IsOptional()
  @IsString()
  @Length(0, 120)
  placeTag?: string | null;
}

export class SocialCommentInput {
  @IsString()
  @Length(1, 500)
  text!: string;
}

export class SocialReportInput {
  @IsIn(["spam", "abuse", "privacy", "other"])
  reason!: "spam" | "abuse" | "privacy" | "other";
}

@Injectable()
export class SocialRepository {
  constructor(private readonly database: CanonicalDatabaseService) {}

  async read(principal: AuthPrincipal, action: "posts" | "comments", params: unknown[]): Promise<Result> {
    try {
      return await this.database.withReadSession(principal, async (client) => {
        const sql = action === "posts"
          ? "select aha_social.list_posts_v1($1::text,$2::integer) as result"
          : "select aha_social.list_comments_v1($1::uuid) as result";
        const response = await client.query<{ result: unknown }>(sql, params);
        const value = response.rows[0]?.result;
        if (!Array.isArray(value)) throw new Error("invalid_social_read_response");
        return value as Record<string, unknown>[];
      });
    } catch (error) {
      return mapSocialDatabaseError(error);
    }
  }

  async write(
    principal: AuthPrincipal,
    action: "publish" | "remove" | "place" | "like" | "comment" | "report",
    params: unknown[]
  ): Promise<Record<string, unknown>> {
    // No user-supplied table names or SQL are permitted.
    const commands: Record<typeof action, string> = {
      publish: "select aha_social.publish_post_v1($1::text,$2::text,$3::text,$4::text,$5::text,$6::text) as result",
      remove: "select aha_social.delete_post_v1($1::uuid) as result",
      place: "select aha_social.set_post_place_tag_v1($1::uuid,$2::text) as result",
      like: "select aha_social.like_post_v1($1::uuid,$2::boolean) as result",
      comment: "select aha_social.comment_post_v1($1::uuid,$2::text) as result",
      report: "select aha_social.report_post_v1($1::uuid,$2::text) as result"
    };
    try {
      return await this.database.withCommandSession(principal, async (client) => {
        const response = await client.query<{ result: unknown }>(commands[action], params);
        const value = response.rows[0]?.result;
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_social_write_response");
        return value as Record<string, unknown>;
      });
    } catch (error) {
      return mapSocialDatabaseError(error);
    }
  }
}

@Injectable()
export class SocialService {
  constructor(private readonly gate: SocialGate, private readonly repository: SocialRepository) {}

  async list(principal: AuthPrincipal, input: SocialListQuery): Promise<Result> {
    this.gate.assertEnabled();
    return this.repository.read(principal, "posts", [input.kind, input.limit]);
  }
  async comments(principal: AuthPrincipal, id: string): Promise<Result> {
    this.gate.assertEnabled();
    return this.repository.read(principal, "comments", [id]);
  }
  async publish(principal: AuthPrincipal, input: SocialPostInput): Promise<Result> {
    this.gate.assertEnabled();
    if (input.publish !== true || typeof input.text !== "string" ||
        (input.kind === "feed" && !input.text.trim()) || !input.requestKey?.trim()) {
      throw new ApiException(400, "VALIDATION_FAILED", "Publishing needs a nonempty post and explicit consent");
    }
    const text = input.text.trim();
    const placeTag = input.placeTag?.trim() || null;
    const instaMode = input.kind === "insta" ? (input.instaMode || "feed") : null;
    if ((input.kind === "feed" && (text.length > 500 || input.instaMode || placeTag)) ||
        (input.kind === "insta" && (
          !["feed", "reel", "map"].includes(instaMode || "") ||
          (placeTag !== null && placeTag.length > 120) ||
          (instaMode === "map" && !placeTag)
        ))) {
      throw new ApiException(400, "VALIDATION_FAILED", "Invalid Feed length or Insta location/format");
    }
    const media = this.gate.assertMedia(input.kind, input.mediaUrl);
    return this.repository.write(principal, "publish",
      [input.kind, text, media, input.requestKey.trim(), instaMode, placeTag]);
  }
  async editPlace(principal: AuthPrincipal, id: string, input: SocialPlaceTagInput): Promise<Result> {
    this.gate.assertEnabled();
    if (!input || !Object.prototype.hasOwnProperty.call(input, "placeTag") ||
        (input.placeTag !== null && typeof input.placeTag !== "string") ||
        (typeof input.placeTag === "string" && input.placeTag.trim().length > 120)) {
      throw new ApiException(400, "VALIDATION_FAILED", "A place tag must be explicitly provided");
    }
    return this.repository.write(principal, "place", [id, input.placeTag?.trim() || null]);
  }
  async remove(principal: AuthPrincipal, id: string): Promise<Result> {
    this.gate.assertEnabled();
    return this.repository.write(principal, "remove", [id]);
  }
  async like(principal: AuthPrincipal, id: string, liked: boolean): Promise<Result> {
    this.gate.assertEnabled();
    return this.repository.write(principal, "like", [id, liked]);
  }
  async comment(principal: AuthPrincipal, id: string, body: string): Promise<Result> {
    this.gate.assertEnabled();
    if (!body?.trim()) throw new ApiException(400, "VALIDATION_FAILED", "Comment cannot be empty");
    return this.repository.write(principal, "comment", [id, body.trim()]);
  }
  async report(principal: AuthPrincipal, id: string, reason: SocialReportInput["reason"]): Promise<Result> {
    this.gate.assertEnabled();
    return this.repository.write(principal, "report", [id, reason]);
  }
}

function requirePrincipal(request: AhaRequest): AuthPrincipal {
  if (!request.principal) throw new ApiException(401, "AUTH_REQUIRED", "A valid bearer token is required");
  return request.principal;
}

@Controller("v1/social")
export class SocialController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig, private readonly service: SocialService) {}
  @Get("posts")
  async list(@Req() req: AhaRequest, @Query() query: SocialListQuery) {
    return apiSuccess(req, this.config.serviceVersion, await this.service.list(requirePrincipal(req), query));
  }
  @Get("posts/:id/comments")
  async comments(@Req() req: AhaRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    return apiSuccess(req, this.config.serviceVersion, await this.service.comments(requirePrincipal(req), id));
  }
  @Post("posts")
  async publish(@Req() req: AhaRequest, @Body() input: SocialPostInput) {
    return apiSuccess(req, this.config.serviceVersion, await this.service.publish(requirePrincipal(req), input));
  }
  @Delete("posts/:id")
  async remove(@Req() req: AhaRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    return apiSuccess(req, this.config.serviceVersion, await this.service.remove(requirePrincipal(req), id));
  }
  @Post("posts/:id/place")
  async editPlace(@Req() req: AhaRequest, @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: SocialPlaceTagInput) {
    return apiSuccess(req, this.config.serviceVersion,
      await this.service.editPlace(requirePrincipal(req), id, input));
  }
  @Post("posts/:id/like")
  async like(@Req() req: AhaRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body() input: SocialLikeInput) {
    return apiSuccess(req, this.config.serviceVersion, await this.service.like(requirePrincipal(req), id, input.liked));
  }
  @Post("posts/:id/comments")
  async comment(@Req() req: AhaRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body() input: SocialCommentInput) {
    return apiSuccess(req, this.config.serviceVersion, await this.service.comment(requirePrincipal(req), id, input.text));
  }
  @Post("posts/:id/reports")
  async report(@Req() req: AhaRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body() input: SocialReportInput) {
    return apiSuccess(req, this.config.serviceVersion, await this.service.report(requirePrincipal(req), id, input.reason));
  }
}

@Module({
  controllers: [SocialController, SocialModerationController, SocialMediaController],
  providers: [SocialGate, SocialRepository, SocialService, SocialModerationRepository, SocialModerationService, SocialMediaRepository, SocialMediaService]
})
export class SocialModule {}
