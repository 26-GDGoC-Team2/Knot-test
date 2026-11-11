import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';

export interface Competition {
  id: number;
  title: string;
  organizer: string | null;
  category: string | null;
  startDate: string | null;
  endDate: string;
  sourceUrl: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CompetitionRepository {
  constructor(private readonly database: DatabaseService) {}

  async findAll(filters: {
    category?: string;
    limit: number;
    offset: number;
  }): Promise<{ competitions: Competition[]; total: number }> {
    const conditions: string[] = ['is_active = TRUE', 'end_date >= CURRENT_DATE'];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.category) {
      conditions.push(`category ILIKE $${idx++}`);
      params.push(`%${filters.category}%`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM competitions ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const result = await this.database.query<{
      id: number;
      title: string;
      organizer: string | null;
      category: string | null;
      start_date: string | null;
      end_date: string;
      source_url: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT
        id, title, organizer, category,
        to_char(start_date, 'YYYY-MM-DD') AS start_date,
        to_char(end_date, 'YYYY-MM-DD') AS end_date,
        source_url, is_active, created_at, updated_at
       FROM competitions
       ${where}
       ORDER BY end_date ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, filters.limit, filters.offset],
    );

    return {
      competitions: result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        organizer: r.organizer,
        category: r.category,
        startDate: r.start_date,
        endDate: r.end_date,
        sourceUrl: r.source_url,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
    };
  }

  async upsert(data: {
    title: string;
    organizer: string | null;
    category: string | null;
    startDate: string | null;
    endDate: string;
    sourceUrl: string;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO competitions (title, organizer, category, start_date, end_date, source_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (source_url) DO UPDATE
         SET title      = EXCLUDED.title,
             organizer  = EXCLUDED.organizer,
             category   = EXCLUDED.category,
             start_date = EXCLUDED.start_date,
             end_date   = EXCLUDED.end_date,
             is_active  = TRUE,
             updated_at = now()`,
      [data.title, data.organizer, data.category, data.startDate, data.endDate, data.sourceUrl],
    );
  }

  async deactivateExpired(): Promise<number> {
    const result = await this.database.query(
      `UPDATE competitions
       SET is_active = FALSE, updated_at = now()
       WHERE end_date < CURRENT_DATE AND is_active = TRUE`,
    );
    return result.rowCount ?? 0;
  }
}
