import { Injectable, NotFoundException } from '@nestjs/common';
import { ArchiveRepository } from './archive.repository';

@Injectable()
export class ArchiveService {
  constructor(private readonly archiveRepository: ArchiveRepository) {}

  async getProjects(
    filters: {
      category?: string;
      cohort?: number;
      techStack?: string;
      keyword?: string;
      page: number;
      limit: number;
    },
    isClubMember: boolean,
  ) {
    const limit = Math.min(filters.limit, 50);
    const offset = (filters.page - 1) * limit;
    const { projects, total } = await this.archiveRepository.findAll({ ...filters, limit, offset });
    return { projects, total, page: filters.page, limit };
  }

  async getProjectDetail(projectId: string, isClubMember: boolean) {
    const project = await this.archiveRepository.findById(projectId);
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return project;
  }

  async createProject(
    data: {
      title: string; description?: string | null; category?: string | null;
      cohort?: number | null; startedAt?: string | null; endedAt?: string | null;
      techStacks: string[];
      members: { userId?: string | null; name: string; role: string }[];
      links: { label: string; url: string }[];
    },
    createdBy: string,
  ) {
    const id = await this.archiveRepository.create(data, createdBy);
    const project = await this.archiveRepository.findById(id);
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return project;
  }

  async updateProject(
    projectId: string,
    data: {
      title?: string; description?: string | null; category?: string | null;
      cohort?: number | null; startedAt?: string | null; endedAt?: string | null;
      techStacks?: string[];
      members?: { userId?: string | null; name: string; role: string }[];
      links?: { label: string; url: string }[];
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
