import { Module } from "@nestjs/common";
import { ProfileController } from "./profile.controller.js";
import {
  CURRENT_PROFILE_REPOSITORY,
  PgCurrentProfileRepository
} from "./profile.repository.js";

@Module({
  controllers: [ProfileController],
  providers: [
    {
      provide: CURRENT_PROFILE_REPOSITORY,
      useClass: PgCurrentProfileRepository
    }
  ],
  exports: [CURRENT_PROFILE_REPOSITORY]
})
export class ProfilesModule {}
