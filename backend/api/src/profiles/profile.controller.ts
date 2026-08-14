import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { AhaRequest } from "../common/request-context.js";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { apiSuccess } from "../api/api-contract.js";
import { ApiException } from "../api/api-exception.js";
import {
  CURRENT_PROFILE_REPOSITORY,
  type CurrentProfileRepository
} from "./profile.repository.js";

@Controller("v1")
export class ProfileController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CURRENT_PROFILE_REPOSITORY) private readonly profiles: CurrentProfileRepository
  ) {}

  @Get("profile")
  async current(@Req() request: AhaRequest) {
    if (!request.principal) {
      throw new ApiException(401, "AUTH_REQUIRED", "A valid bearer token is required");
    }

    const profile = await this.profiles.findCurrent(request.principal);
    if (!profile) {
      throw new ApiException(404, "PROFILE_NOT_FOUND", "No active canonical profile was found");
    }

    return apiSuccess(request, this.config.serviceVersion, profile);
  }
}
