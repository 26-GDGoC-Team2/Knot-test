import { Module } from '@nestjs/common';
import { ApplicationRepository } from './application.repository';
import { ApplicationService } from './application.service';
import { ApplicationController, RecruitmentController } from './recruitment.controller';
import { RecruitmentRepository } from './recruitment.repository';
import { RecruitmentService } from './recruitment.service';

@Module({
  controllers: [RecruitmentController, ApplicationController],
  providers: [RecruitmentRepository, ApplicationRepository, RecruitmentService, ApplicationService],
  exports: [RecruitmentRepository, ApplicationRepository, RecruitmentService],
})
export class RecruitmentModule {}
