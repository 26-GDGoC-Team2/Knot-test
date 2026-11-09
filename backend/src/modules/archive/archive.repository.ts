import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';

export interface ClubProject {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  cohort: number | null;
  techStacks: string[];
  memberCount: number;
  createdAt: Date;
}

export interface ClubProjectDetail extends ClubProject {
  members: { userId: string | null; name: string; role: string }[];
}

@Injectable()
export class ArchiveRepository {
  constructor(private readonly database: DatabaseService) {}

  async findAll(filters: {
    category?: string;
    cohort?: number;
    techStack?: string;
    keyword?: string;
    limit: number;
    offset: number;
  }): Promise<{ projects: ClubProject[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.category) {
      conditions.push(`p.category = $${idx++}`);
      params.push(filters.category);
    }
    if (filters.cohort) {
      conditions.push(`p.cohort = $${idx++}`);
      params.push(filters.cohort);
    }
    if (filters.techStack) {
      conditions.push(`$${idx++} = ANY(p.tech_stacks)`);
      params.push(filters.techStack);
    }
    if (filters.keyword) {
      conditions.push(`(p.title ILIKE $${idx} OR p.description ILIKE $${idx})`);
      params.push(`%${filters.keyword}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM club_projects p ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const result = await this.database.query<{
      id: string;
      title: string;
      description: string | null;
      category: string | null;
      cohort: number | null;
      tech_stacks: string[];
      member_count: number;
      created_at: Date;
    }>(
      `SELECT
         p.id, p.title, p.description, p.category, p.cohort,
         p.tech_stacks,
         (SELECT COUNT(*) FROM club_project_members m WHERE m.project_id = p.id)::int AS member_count,
         p.created_at
       FROM club_projects p
       ${where}
       ORDER BY p.cohort DESC NULLS LAST, p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, filters.limit, filters.offset],
    );

    return {
      projects: result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        cohort: r.cohort,
        techStacks: r.tech_stacks ?? [],
        memberCount: r.member_count,
        createdAt: r.created_at,
      })),
      total,
    };
  }

  async findById(projectId: string): Promise<ClubProjectDetail | null> {
    const result = await this.database.query<{
      id: string;
      title: string;
      description: string | null;
      category: string | null;
      cohort: number | null;
      tech_stacks: string[];
      created_at: Date;
    }>(
      `SELECT id, title, description, category, cohort, tech_stacks, created_at
         FROM club_projects WHERE id = $1`,
      [projectId],
    );
    if (!result.rows[0]) return null;
    const p = result.rows[0];

    const membersResult = await this.database.query<{
      user_id: string | null;
      name: string;
      role: string;
    }>(
      `SELECT user_id, name, role FROM club_project_members WHERE project_id = $1 ORDER BY created_at`,
      [projectId],
    );

    return {
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category,
      cohort: p.cohort,
      techStacks: p.tech_stacks ?? [],
      memberCount: membersResult.rows.length,
      createdAt: p.created_at,
      members: membersResult.rows.map((m) => ({
        userId: m.user_id,
        name: m.name,
        role: m.role,
      })),
    };
  }
}