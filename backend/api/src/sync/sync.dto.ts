import { Type } from "class-transformer";
import {
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf
} from "class-validator";

export const CANONICAL_SYNC_OBJECT_TYPES = Object.freeze([
  "conversation",
  "message",
  "source_event",
  "insight",
  "concept_list",
  "concept_list_item",
  "knowledge_path",
  "knowledge_path_step",
  "article",
  "article_reference"
] as const);

export type CanonicalSyncObjectType = (typeof CANONICAL_SYNC_OBJECT_TYPES)[number];
export type CanonicalSyncOperation = "upsert" | "delete";

export class SyncBootstrapQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  workspaceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  afterKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  highWatermark?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class SyncPullQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  workspaceId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  afterCursor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class SyncPushRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  workspaceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  deviceId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  idempotencyKey!: string;

  @IsString()
  @IsIn(CANONICAL_SYNC_OBJECT_TYPES)
  objectType!: CanonicalSyncObjectType;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  objectId!: string;

  @IsString()
  @IsIn(["upsert", "delete"])
  operation!: CanonicalSyncOperation;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseRevision!: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  payloadHash!: string;

  @ValidateIf((request: SyncPushRequestDto) => request.operation === "upsert")
  @IsDefined()
  @IsObject()
  payload?: Record<string, unknown> | null;
}
