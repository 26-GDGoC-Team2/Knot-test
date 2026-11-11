import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CompetitionController } from './competition.controller';
import { CompetitionRepository } from './competition.repository';
import { CompetitionService } from './competition.service';
import { WevityCrawler } from './wevity.crawler';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [CompetitionController],
  providers: [CompetitionRepository, CompetitionService, WevityCrawler],
})
export class CompetitionModule {}
