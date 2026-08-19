import { Module } from "@nestjs/common";
import { FysenAuthorizationService } from "./fysen-authorization.service.js";
import { FYSEN_INTEGRATION_CONFIG, loadFysenIntegrationConfig } from "./fysen-integration.config.js";
import { FysenIntegrationController } from "./fysen-integration.controller.js";

@Module({
  controllers: [FysenIntegrationController],
  providers: [
    {
      provide: FYSEN_INTEGRATION_CONFIG,
      useFactory: () => loadFysenIntegrationConfig()
    },
    FysenAuthorizationService
  ]
})
export class FysenIntegrationModule {}
