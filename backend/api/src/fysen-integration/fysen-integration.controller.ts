import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { apiSuccess } from "../api/api-contract.js";
import { ApiException } from "../api/api-exception.js";
import { Public } from "../auth/public.decorator.js";
import type { AhaRequest } from "../common/request-context.js";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { FysenAuthorizationExchangeRequestDto, FysenAuthorizationRequestDto } from "./fysen-authorization.dto.js";
import { FysenAuthorizationService } from "./fysen-authorization.service.js";

@Controller("v1/integrations/fysen")
export class FysenIntegrationController {
  constructor(
    @Inject(APP_CONFIG) private readonly appConfig: AppConfig,
    private readonly authorizations: FysenAuthorizationService
  ) {}

  @Post("authorization")
  authorization(@Req() request: AhaRequest, @Body() body: FysenAuthorizationRequestDto) {
    if (!request.principal) {
      throw new ApiException(401, "AUTH_REQUIRED", "A valid bearer token is required");
    }
    return apiSuccess(request, this.appConfig.serviceVersion, this.authorizations.issue(request.principal, body));
  }

  @Public()
  @Post("exchange")
  exchange(@Req() request: AhaRequest, @Body() body: FysenAuthorizationExchangeRequestDto) {
    return apiSuccess(request, this.appConfig.serviceVersion, this.authorizations.exchange(body));
  }
}
