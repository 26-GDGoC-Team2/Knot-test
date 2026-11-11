import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';

export interface ArchiveLink {
  id: string;
  label: string;
  url: string;
  sortOrder: number;
}

export interface ClubProject {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  cohort: number | null;
  techStacks: string[];
  memberCount: number;
  startedAt: string | null;
  endedAt: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface ClubProjectDetail extends ClubProject {
  members: { userId: string | null; name: string; role: string }[];
  links: ArchiveLink[];
}

// 'YYYY-MM' 형식을 DATE 컬럼에 넣을 수 있도록 'YYYY-MM-01'로 변환. null/undefined는 그대로.
function toDateValue(val: string | null | undefined): string | null {
  if (!val) return null;
  // 이미 YYYY-MM-DD 형식이면 그대로
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  // YYYY-MM 형식이면 첫째 날로 변환
  if (/^\d{4}-\d{2}$/.test(val)) return `${val}-01`;
  return val;
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

    if (filters.category)  { conditions.push(`p.category = $${idx++}`);           params.push(filters.category); }
    if (filters.cohort)    { conditions.push(`p.cohort = $${idx++}`);              params.push(filters.cohort); }
    if (filters.techStack) { conditions.push(`$${idx++} = ANY(p.tech_stacks)`);    params.push(filters.techStack); }
    if (filters.keyword)   {
      conditions.push(`(p.title ILIKE $${idx} OR p.description ILIKE $${idx})`);
      params.push(`%${filters.keyword}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM club_projects p ${where}`, params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const result = await this.database.query<{
      id: string; title: string; description: string | null; category: string | null;
      cohort: number | null; tech_stacks: string[]; member_count: number;
      started_at: string | null; ended_at: string | null;
      created_by: string | null; created_at: Date;
    }>(
      `SELECT p.id, p.title, p.description, p.category, p.cohort, p.tech_stacks,
              (SELECT COUNT(*) FROM club_project_members m WHERE m.project_id = p.id)::int AS member_count,
              to_char(p.started_at, 'YYYY-MM') AS started_at,
              to_char(p.ended_at,   'YYYY-MM') AS ended_at,
              p.created_by, p.created_at
       FROM club_projects p ${where}
       ORDER BY p.cohort DESC NULLS LAST, p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, filters.limit, filters.offset],
    );

    return {
      projects: result.rows.map((r) => ({
        id: r.id, title: r.title, description: r.description, category: r.category,
        cohort: r.cohort, techStacks: r.tech_stacks ?? [], memberCount: r.member_count,
        startedAt: r.started_at, endedAt: r.ended_at,
        createdBy: r.created_by, createdAt: r.created_at,
      })),
      total,
    };
  }

  async findById(projectId: string): Promise<ClubProjectDetail | null> {
    const result = await this.database.query<{
      id: string; title: string; description: string | null; category: string | null;
      cohort: number | null; tech_stacks: string[];
      started_at: string | null; ended_at: string | null;
      created_by: string | null; created_at: Date;
    }>(
      `SELECT id, title, description, category, cohort, tech_stacks,
              to_char(started_at, 'YYYY-MM') AS started_at,
              to_char(ended_at,   'YYYY-MM') AS ended_at,
              created_by, created_at
       FROM club_projects WHERE id = $1`,
      [projectId],
    );
    if (!result.rows[0]) return null;
    const p = result.rows[0];

    const [membersResult, linksResult] = await Promise.all([
      this.database.query<{ user_id: string | null; name: string; role: string }>(
        `SELECT user_id, name, role FROM club_project_members WHERE project_id = $1 ORDER BY created_at`,
        [projectId],
      ),
      this.database.query<{ id: string; label: string; url: string; sort_order: number }>(
        `SELECT id, label, url, sort_order FROM club_project_links WHERE project_id = $1 ORDER BY sort_order, created_at`,
        [projectId],
      ),
    ]);

    return {
      id: p.id, title: p.title, description: p.description, category: p.category,
      cohort: p.cohort, techStacks: p.tech_stacks ?? [],
      memberCount: membersResult.rows.length,
      startedAt: p.started_at, endedAt: p.ended_at,
      createdBy: p.created_by, createdAt: p.created_at,
      members: membersResult.rows.map((m) => ({ userId: m.user_id, name: m.name, role: m.role })),
      links: linksResult.rows.map((l) => ({ id: l.id, label: l.label, url: l.url, sortOrder: l.sort_order })),
    };
  }

  async create(
    data: {
      title: string; description?: string | null; category?: string | null;
      cohort?: number | null; startedAt?: string | null; endedAt?: string | null;
      techStacks: string[];
      members: { userId?: string | null; name: string; role: string }[];
      links: { label: string; url: string }[];
    },
    createdBy: string,
  ): Promise<string> {
    const result = await this.database.query<{ id: string }>(
      `INSERT INTO club_projects
         (title, description, category, cohort, started_at, ended_at, tech_stacks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        data.title, data.description ?? null, data.category ?? null, data.cohort ?? null,
        toDateValue(data.startedAt), toDateValue(data.endedAt),
        data.techStacks, createdBy,
      ],
    );
    const projectId = result.rows[0].id;

    for (const m of data.members) {
      await this.database.query(
        `INSERT INTO club_project_members (project_id, user_id, name, role) VALUES ($1,$2,$3,$4)`,
        [projectId, m.userId ?? null, m.name, m.role],
      );
    }
    for (let i = 0; i < data.links.length; i++) {
      await this.database.query(
        `INSERT INTO club_project_links (project_id, label, url, sort_order) VALUES ($1,$2,$3,$4)`,
        [projectId, data.links[i].label, data.links[i].url, i],
      );
    }
    return projectId;
  }

  async update(
    projectId: string,
    data: {
      title?: string; description?: string | null; category?: string | null;
      cohort?: number | null; startedAt?: string | null; endedAt?: string | null;
      techStacks?: string[];
      members?: { userId?: string | null; name: string; role: string }[];
      links?: { label: string; url: string }[];
    },
  ): Promise<boolean> {
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.title       !== undefined) { fields.push(`title = $${idx++}`);       params.push(data.title); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
    if (data.category    !== undefined) { fields.push(`category = $${idx++}`);    params.push(data.category); }
    if (data.cohort      !== undefined) { fields.push(`cohort = $${idx++}`);      params.push(data.cohort); }
    if (data.startedAt   !== undefined) { fields.push(`started_at = $${idx++}`);  params.push(toDateValue(data.startedAt)); }
    if (data.endedAt     !== undefined) { fields.push(`ended_at = $${idx++}`);    params.push(toDateValue(data.endedAt)); }
    if (data.techStacks  !== undefined) { fields.push(`tech_stacks = $${idx++}`); params.push(data.techStacks); }

    if (fields.length > 0) {
      fields.push(`updated_at = now()`);
      params.push(projectId);
      const r = await this.database.query(
        `UPDATE club_projects SET ${fields.join(', ')} WHERE id = $${idx}`, params,
      );
      if (r.rowCount === 0) return false;
    }

    if (data.members !== undefined) {
      await this.database.query(`DELETE FROM club_project_members WHERE project_id = $1`, [projectId]);
      for (const m of data.members) {
        await this.database.query(
          `INSERT INTO club_project_members (project_id, user_id, name, role) VALUES ($1,$2,$3,$4)`,
          [projectId, m.userId ?? null, m.name, m.role],
        );
      }
    }

    if (data.links !== undefined) {
      await this.database.query(`DELETE FROM club_project_links WHERE project_id = $1`, [projectId]);
      for (let i = 0; i < data.links.length; i++) {
        await this.database.query(
          `INSERT INTO club_project_links (project_id, label, url, sort_order) VALUES ($1,$2,$3,$4)`,
          [projectId, data.links[i].label, data.links[i].url, i],
        );
      }
    }
    return true;
  }

  async delete(projectId: string): Promise<boolean> {
    const r = await this.database.query(`DELETE FROM club_projects WHERE id = $1`, [projectId]);
    return (r.rowCount ?? 0) > 0;
  }
}
