import { Injectable } from '@nestjs/common';
import { CompetitionRepository } from './competition.repository';

@Injectable()
export class CompetitionService {
  constructor(private readonly competitionRepository: CompetitionRepository) {}

  async getCompetitions(query: { category?: string; page?: number; limit?: number }) {
    const limit = query.limit ?? 20;
    const offset = ((query.page ?? 1) - 1) * limit;

    const { competitions, total } = await this.competitionRepository.findAll({
      category: query.category,
      limit,
      offset,
    });

    return {
      competitions: competitions.map((c) => ({
        id: c.id,
        title: c.title,
        organizer: c.organizer,
        category: c.category,
        startDate: c.startDate,
        endDate: c.endDate,
        dday: this.calcDday(c.endDate),
        sourceUrl: c.sourceUrl,
      })),
      total,
      page: query.page ?? 1,
      limit,
    };
  }

  /** 마감 7일 이내면 D-day 반환, 아니면 null */
  private calcDday(endDate: string): string | null {
    const diff = Math.ceil(
      (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (diff < 0) return null;
    if (diff <= 7) return diff === 0 ? 'D-day' : `D-${diff}`;
    return null;
  }
}
