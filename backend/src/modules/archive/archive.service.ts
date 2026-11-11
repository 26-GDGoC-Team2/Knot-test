import { Injectable, NotFoundException } from '@nestjs/common';
import { ArchiveRepository } from './archive.repository';

@Injectable()
export class ArchiveService {
  constructor(private readonly archiveRepository: ArchiveRepository) {}

  async getProjects(
    query: {
      category?: string;
      cohort?: number;
      techStack?: string;
      keyword?: string;
      page?: number;
      limit?: number;
    },
    isClubMember: boolean,
  ) {
    const limit = Math.min(query.limit ?? 20, 50);
    const offset = ((query.page ?? 1) - 1) * limit;

    const { projects, total } = await this.archiveRepository.findAll({
      category: query.category,
      cohort: query.cohort ? Number(query.cohort) : undefined,
      techStack: query.techStack,
      keyword: query.keyword,
      limit,
      offset,
    });

    return {
      projects,
      pagination: {
        total,
        page: query.page ?? 1,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getProjectDetail(projectId: string, isClubMember: boolean) {
    const project = await this.archiveRepository.findById(projectId);
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');

    // 동아리 밖 인원은 이름만 표시 (userId 숨김)
    const members = project.members.map((m) => ({
      name: m.name,
      role: m.role,
      ...(isClubMember ? { userId: m.userId } : {}),
    }));

    return { ...project, members };
  }

  async createProject(
    data: {
      title: string;
      description?: string | null;
      category?: string | null;
      cohort?: number | null;
      techStacks: string[];
      members: { userId?: string | null; name: string; role: string }[];
    },
  ) {
    const id = await this.archiveRepository.create(data);
    const project = await this.archiveRepository.findById(id);
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return project;
  }

  async updateProject(
    projectId: string,
    data: {
      title?: string;
      description?: string | null;
      category?: string | null;
      cohort?: number | null;
      techStacks?: string[];
      members?: { userId?: string | null; name: string; role: string }[];
    },
  ) {
    const updated = await this.archiveRepository.update(projectId, data);
    if (!updated) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    const project = await this.archiveRepository.findById(projectId);
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return project;
  }

  async deleteProject(projectId: string) {
    const deleted = await this.archiveRepository.delete(projectId);
    if (!deleted) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return { message: '아카이브가 삭제됐어요.' };
  }
}
