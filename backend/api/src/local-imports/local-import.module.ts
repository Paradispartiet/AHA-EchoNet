import { Module } from "@nestjs/common";
import { LocalImportConfirmationService } from "./local-import-confirmation.service.js";
import { LOCAL_IMPORT_CONFIG, loadLocalImportConfig } from "./local-import.config.js";
import { LocalImportController } from "./local-import.controller.js";
import { LocalImportRepository } from "./local-import.repository.js";
import { LocalImportService } from "./local-import.service.js";

@Module({
  controllers: [LocalImportController],
  providers: [
    {
      provide: LOCAL_IMPORT_CONFIG,
      useFactory: () => loadLocalImportConfig()
    },
    LocalImportConfirmationService,
    LocalImportRepository,
    LocalImportService
  ]
})
export class LocalImportModule {}
