import { Module } from '@nestjs/common';
import { NotificationModule } from '../notifications/notification.module';
import { ApplicationRepository } from './application.repository';
import { ApplicationService } from './application.service';
import { ApplicationController, RecruitmentController } from './recruitment.controller';
import { RecruitmentRepository } from './recruitment.repository';
import { RecruitmentService } from './recruitment.service';

@Module({
  imports: [NotificationModule],
  controllers: [RecruitmentController, ApplicationController],
  providers: [RecruitmentRepository, ApplicationRepository, RecruitmentService, ApplicationService],
  exports: [RecruitmentRepository, ApplicationRepository, RecruitmentService],
})
export class RecruitmentModule {}
