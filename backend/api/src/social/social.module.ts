import { Body, Controller, Delete, Get, Inject, Injectable, Module, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { Type } from "class-transformer";
import { Equals, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from "class-validator";
import { apiSuccess } from "../api/api-contract.js";
import { ApiException } from "../api/api-exception.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import type { AhaRequest } from "../common/request-context.js";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { CanonicalDatabaseService } from "../database/canonical-database.service.js";
import { SocialModerationController, SocialModerationRepository, SocialModerationService } from "./social-moderation.module.js";
import { SocialGate, mapSocialDatabaseError } from "./social-shared.js";
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
  @Length(1, 2000)
  text!: string;

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  mediaUrl?: string;

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
    action: "publish" | "remove" | "like" | "comment" | "report",
    params: unknown[]
  ): Promise<Record<string, unknown>> {
    // No user-supplied table names or SQL are permitted.
    const commands: Record<typeof action, string> = {
      publish: "select aha_social.publish_post_v1($1::text,$2::text,$3::text,$4::text) as result",
      remove: "select aha_social.delete_post_v1($1::uuid) as result",
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
    if (input.publish !== true || !input.text?.trim() || !input.requestKey?.trim()) {
      throw new ApiException(400, "VALIDATION_FAILED", "Publishing needs a nonempty post and explicit consent");
    }
    const media = this.gate.assertMedia(input.kind, input.mediaUrl);
    return this.repository.write(principal, "publish", [input.kind, input.text.trim(), media, input.requestKey.trim()]);
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
  controllers: [SocialController, SocialModerationController],
  providers: [SocialGate, SocialRepository, SocialService, SocialModerationRepository, SocialModerationService]
})
export class SocialModule {}
