import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

  // 수정: 작성자·참여 부원·운영진만 가능
  async updateProject(
    projectId: string,
    data: {
      title?: string; description?: string | null; category?: string | null;
      cohort?: number | null; startedAt?: string | null; endedAt?: string | null;
      techStacks?: string[];
      members?: { userId?: string | null; name: string; role: string }[];
      links?: { label: string; url: string }[];
    },
    actorId: string,
  ) {
    await this.assertCanModify(projectId, actorId);
    const updated = await this.archiveRepository.update(projectId, data);
    if (!updated) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    const project = await this.archiveRepository.findById(projectId);
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return project;
  }

  // 삭제: 작성자·참여 부원·운영진만 가능
  async deleteProject(projectId: string, actorId: string) {
    await this.assertCanModify(projectId, actorId);
    const deleted = await this.archiveRepository.delete(projectId);
    if (!deleted) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return { message: '아카이브가 삭제됐어요.' };
  }

  // 수정·삭제 권한 확인 (프론트의 수정 버튼 노출 기준과 같다: 작성자 또는 참여 부원, 그리고 운영진)
  // 작성자 정보가 없는 예전 글(created_by 없음)은 참여 부원과 운영진만 가능하다
  private async assertCanModify(projectId: string, actorId: string): Promise<void> {
    const project = await this.archiveRepository.findById(projectId);
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');

    const isOwner = project.createdBy === actorId;
    const isParticipant = project.members.some((m) => m.userId === actorId);
    if (isOwner || isParticipant) return;

    // 운영진 여부는 JWT(최대 30분 지연)가 아니라 DB 값으로 확인한다
    if (await this.archiveRepository.isActiveAdmin(actorId)) return;
    throw new ForbiddenException('작성자, 참여 부원, 운영진만 수정하거나 삭제할 수 있어요.');
  }
}
