import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';

export interface ActivitySummary {
  userId: string;
  projectCount: number;
  sessionCount: number;
  contestCount: number;
  studyCount: number;
  totalScore: number;
  isGraduated: boolean;
  updatedAt: Date | null;
}

export interface ParticipationRecord {
  id: string;
  userId: string;
  activityType: string;
  activityName: string;
  participatedAt: Date;
  createdAt: Date;
}

@Injectable()
export class ActivityRepository {
  constructor(private readonly database: DatabaseService) {}

  async getActivitySummary(userId: string): Promise<ActivitySummary | null> {
    const result = await this.database.query<{
      user_id: string;
      project_count: number;
      session_count: number;
      contest_count: number;
      study_count: number;
      total_score: number;
      is_graduated: boolean;
      updated_at: Date | null;
    }>(
      `SELECT
         a.user_id,
         a.project_count,
         a.session_count,
         a.contest_count,
         a.study_count,
         a.total_score,
         u.is_graduated,
         a.updated_at
       FROM activity_scores a
       JOIN users u ON u.id = a.user_id
       WHERE a.user_id = $1`,
      [userId],
    );
    if (!result.rows[0]) return null;
    const r = result.rows[0];
    return {
      userId: r.user_id,
      projectCount: r.project_count,
      sessionCount: r.session_count,
      contestCount: r.contest_count,
      studyCount: r.study_count,
      totalScore: r.total_score,
      isGraduated: r.is_graduated,
      updatedAt: r.updated_at,
    };
  }

  async getParticipationRecords(userId: string): Promise<ParticipationRecord[]> {
    const result = await this.database.query<{
      id: string;
      user_id: string;
      activity_type: string;
      activity_name: string;
      participated_at: Date;
      created_at: Date;
    }>(
      `SELECT id, user_id, activity_type, activity_name, participated_at, created_at
         FROM participation_records
         WHERE user_id = $1
         ORDER BY participated_at DESC`,
      [userId],
    );
    return result.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      activityType: r.activity_type,
      activityName: r.activity_name,
      participatedAt: r.participated_at,
      createdAt: r.created_at,
    }));
  }

  async getGraduationStatus(userId: string): Promise<boolean | null> {
    const result = await this.database.query<{ is_graduated: boolean }>(
      `SELECT is_graduated FROM users WHERE id = $1 AND status != 'WITHDRAWN'`,
      [userId],
    );
    return result.rows[0]?.is_graduated ?? null;
  }

  async upsertActivityScore(userId: string): Promise<void> {
    await this.database.query(
      `INSERT INTO activity_scores (user_id, project_count, session_count, contest_count, study_count, total_score, updated_at)
       SELECT
         $1::uuid,
         COUNT(*) FILTER (WHERE activity_type = 'PROJECT'),
         COUNT(*) FILTER (WHERE activity_type = 'SESSION'),
         COUNT(*) FILTER (WHERE activity_type = 'CONTEST'),
         COUNT(*) FILTER (WHERE activity_type = 'STUDY'),
         (
           LEAST(COUNT(*) FILTER (WHERE activity_type = 'PROJECT'), 1) * 30 +
           LEAST(COUNT(*) FILTER (WHERE activity_type = 'SESSION') +
                 COUNT(*) FILTER (WHERE activity_type = 'CONTEST'), 4) * 10 +
           LEAST(COUNT(*) FILTER (WHERE activity_type = 'STUDY'), 1) * 20
         ),
         NOW()
       FROM participation_records
       WHERE user_id = $1
       ON CONFLICT (user_id) DO UPDATE SET
         project_count  = EXCLUDED.project_count,
         session_count  = EXCLUDED.session_count,
         contest_count  = EXCLUDED.contest_count,
         study_count    = EXCLUDED.study_count,
         total_score    = EXCLUDED.total_score,
         updated_at     = EXCLUDED.updated_at`,
      [userId],
    );
  }

  async addParticipationRecord(
    userId: string,
    activityType: string,
    activityName: string,
    participatedAt: Date,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO participation_records (user_id, activity_type, activity_name, participated_at)
         VALUES ($1, $2, $3, $4)`,
      [userId, activityType, activityName, participatedAt],
    );
  }
}