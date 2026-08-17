import { Module } from "@nestjs/common";
import { CANONICAL_SYNC_CONFIG, loadCanonicalSyncConfig } from "./sync.config.js";
import { CanonicalSyncController } from "./sync.controller.js";
import { CanonicalSyncRepository } from "./sync.repository.js";
import { CanonicalSyncService } from "./sync.service.js";

@Module({
  controllers: [CanonicalSyncController],
  providers: [
    {
      provide: CANONICAL_SYNC_CONFIG,
      useFactory: () => loadCanonicalSyncConfig()
    },
    CanonicalSyncRepository,
    CanonicalSyncService
  ],
  exports: [CANONICAL_SYNC_CONFIG]
})
export class CanonicalSyncModule {}
