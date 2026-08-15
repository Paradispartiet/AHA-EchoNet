import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { apiSuccess } from "../api/api-contract.js";
import type { AhaRequest } from "../common/request-context.js";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { LocalImportCommitRequestDto, LocalImportConfirmationRequestDto } from "./local-import.dto.js";
import { LocalImportService } from "./local-import.service.js";

@Controller("v1/local-imports")
export class LocalImportController {
  constructor(
    @Inject(APP_CONFIG) private readonly appConfig: AppConfig,
    private readonly imports: LocalImportService
  ) {}

  @Post("confirmation")
  confirmation(@Req() request: AhaRequest, @Body() body: LocalImportConfirmationRequestDto) {
    const principal = requirePrincipal(request);
    return apiSuccess(request, this.appConfig.serviceVersion, this.imports.createConfirmation(principal, body));
  }

  @Post("commit")
  async commit(@Req() request: AhaRequest, @Body() body: LocalImportCommitRequestDto) {
    const principal = requirePrincipal(request);
    const result = await this.imports.commit(principal, body);
    return apiSuccess(request, this.appConfig.serviceVersion, result);
  }
}

function requirePrincipal(request: AhaRequest) {
  if (!request.principal) throw new Error("auth_guard_principal_missing");
  return request.principal;
}
