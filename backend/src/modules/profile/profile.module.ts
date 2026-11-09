import { Module } from '@nestjs/common';
import { MemberController, ProfileController } from './profile.controller';
import { ProfileRepository } from './profile.repository';
import { ProfileService } from './profile.service';

@Module({
  controllers: [ProfileController, MemberController],
  providers: [ProfileService, ProfileRepository],
  exports: [ProfileService],
})
export class ProfileModule {}
