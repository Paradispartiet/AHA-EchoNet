import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query, Req } from "@nestjs/common";
import { apiSuccess } from "../api/api-contract.js";
import type { AhaRequest } from "../common/request-context.js";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { SyncBootstrapQueryDto, SyncPullQueryDto, SyncPushRequestDto } from "./sync.dto.js";
import { CanonicalSyncService } from "./sync.service.js";

@Controller("v1/sync")
export class CanonicalSyncController {
  constructor(
    @Inject(APP_CONFIG) private readonly appConfig: AppConfig,
    private readonly sync: CanonicalSyncService
  ) {}

  @Get("bootstrap")
  async bootstrap(@Req() request: AhaRequest, @Query() query: SyncBootstrapQueryDto) {
    const principal = requirePrincipal(request);
    return apiSuccess(request, this.appConfig.serviceVersion, await this.sync.bootstrap(principal, query));
  }

  @Get("pull")
  async pull(@Req() request: AhaRequest, @Query() query: SyncPullQueryDto) {
    const principal = requirePrincipal(request);
    return apiSuccess(request, this.appConfig.serviceVersion, await this.sync.pull(principal, query));
  }

  @Post("push")
  @HttpCode(HttpStatus.OK)
  async push(@Req() request: AhaRequest, @Body() body: SyncPushRequestDto) {
    const principal = requirePrincipal(request);
    return apiSuccess(request, this.appConfig.serviceVersion, await this.sync.push(principal, body));
  }
}

function requirePrincipal(request: AhaRequest) {
  if (!request.principal) throw new Error("auth_guard_principal_missing");
  return request.principal;
}
