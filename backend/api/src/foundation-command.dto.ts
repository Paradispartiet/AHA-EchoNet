import { IsIn, IsString, Length, Matches } from "class-validator";

export class FoundationCommandEnvelope {
  @IsString()
  @Length(1, 120)
  workspaceId!: string;

  @IsIn(["health_check", "auth_context"])
  command!: "health_check" | "auth_context";

  @IsString()
  @Length(8, 128)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/)
  idempotencyKey!: string;
}
