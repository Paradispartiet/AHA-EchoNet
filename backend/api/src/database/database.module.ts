import { Global, Module } from "@nestjs/common";
import { CanonicalDatabaseService } from "./canonical-database.service.js";
import { DATABASE_CONFIG, loadDatabaseConfig } from "./database-config.js";
import { DATABASE_CONNECTION_PROVIDER } from "./database.types.js";
import { PgConnectionProvider } from "./pg-connection.provider.js";

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONFIG,
      useFactory: () => loadDatabaseConfig()
    },
    {
      provide: DATABASE_CONNECTION_PROVIDER,
      inject: [DATABASE_CONFIG],
      useFactory: (config: ReturnType<typeof loadDatabaseConfig>) => new PgConnectionProvider(config)
    },
    CanonicalDatabaseService
  ],
  exports: [DATABASE_CONFIG, DATABASE_CONNECTION_PROVIDER, CanonicalDatabaseService]
})
export class DatabaseModule {}
