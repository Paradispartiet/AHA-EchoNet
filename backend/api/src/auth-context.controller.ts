import { Controller, Get, Inject, Req } from "@nestjs/common";
import { apiSuccess } from "./api/api-contract.js";
import type { AhaRequest } from "./common/request-context.js";
import { APP_CONFIG, type AppConfig } from "./config/app-config.js";

@Controller("v1/auth")
export class AuthContextController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get("context")
  context(@Req() request: AhaRequest) {
    const principal = request.principal;
    return apiSuccess(request, this.config.serviceVersion, {
      authenticated: Boolean(principal),
      principal: principal
        ? {
            subject: principal.subject,
            provider: principal.provider,
            issuer: principal.issuer,
            audience: principal.audience
          }
        : null
    });
  }
}
