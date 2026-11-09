import { Module } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { RecommendationRepository } from './recommendation.repository';

@Module({
  controllers: [RecommendationController],
  providers: [RecommendationService, RecommendationRepository],
})
export class RecommendationModule {}