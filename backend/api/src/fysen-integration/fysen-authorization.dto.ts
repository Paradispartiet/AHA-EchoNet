import { IsString, Matches, MaxLength, MinLength } from "class-validator";

const PKCE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const AUTHORIZATION_CODE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export class FysenAuthorizationRequestDto {
  @IsString() @Matches(/^fysen$/) clientId!: "fysen";
  @IsString() @MinLength(1) @MaxLength(500) redirectUri!: string;
  @IsString() @Matches(PKCE_PATTERN) codeChallenge!: string;
}

export class FysenAuthorizationExchangeRequestDto {
  @IsString() @Matches(/^fysen$/) clientId!: "fysen";
  @IsString() @MinLength(1) @MaxLength(500) redirectUri!: string;
  @IsString() @Matches(PKCE_PATTERN) codeVerifier!: string;
  @IsString() @MinLength(32) @MaxLength(4096) @Matches(AUTHORIZATION_CODE_PATTERN) authorizationCode!: string;
}
