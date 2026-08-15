import { Type } from "class-transformer";
import {
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

const HASH_PATTERN = /^[a-f0-9]{64}$/;

export class LocalImportCountsDto {
  @IsInt() @Min(0) @Max(100_000) conversations!: number;
  @IsInt() @Min(0) @Max(100_000) messages!: number;
  @IsInt() @Min(0) @Max(100_000) sourceEvents!: number;
  @IsInt() @Min(0) @Max(100_000) insights!: number;
  @IsInt() @Min(0) @Max(100_000) conceptLists!: number;
  @IsInt() @Min(0) @Max(100_000) conceptListItems!: number;
  @IsInt() @Min(0) @Max(100_000) knowledgePaths!: number;
  @IsInt() @Min(0) @Max(100_000) knowledgePathSteps!: number;
  @IsInt() @Min(0) @Max(100_000) articles!: number;
  @IsInt() @Min(0) @Max(100_000) articleReferences!: number;
  @IsInt() @Min(0) @Max(100_000) total!: number;
}

export class LocalImportConfirmationRequestDto {
  @IsString() @Matches(/^aha_local_backup$/) sourceKind!: "aha_local_backup";
  @IsString() @Matches(/^v1$/) sourceVersion!: "v1";
  @IsString() @Matches(HASH_PATTERN) payloadHash!: string;
  @IsString() @Matches(HASH_PATTERN) planHash!: string;
  @ValidateNested() @Type(() => LocalImportCountsDto) counts!: LocalImportCountsDto;
}

export class LocalImportCommitRequestDto {
  @IsString() @Matches(/^aha_local_backup$/) sourceKind!: "aha_local_backup";
  @IsString() @Matches(/^v1$/) sourceVersion!: "v1";
  @IsString() @Matches(HASH_PATTERN) payloadHash!: string;
  @IsString() @Matches(HASH_PATTERN) planHash!: string;
  @IsString() @MinLength(8) @MaxLength(160) idempotencyKey!: string;
  @IsString() @MinLength(32) @MaxLength(4096) confirmationToken!: string;
  @IsObject() plan!: Record<string, unknown>;
}
