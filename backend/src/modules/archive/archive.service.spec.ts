// 아카이브 수정·삭제 권한 단위 테스트 (DB 없이 저장소를 가짜로 대체)
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ArchiveService } from './archive.service';

describe('ArchiveService 수정(작성자·참여 부원)·삭제(+운영진) 권한', () => {
  const project = {
    id: 'p1',
    createdBy: 'owner',
    members: [{ userId: 'part', name: '참여', role: 'FE' }, { userId: null, name: '외부', role: 'BE' }],
  };
  const repo = {
    findById: jest.fn(),
    isActiveAdmin: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  let service: ArchiveService;

  beforeEach(() => {
    jest.resetAllMocks();
    repo.findById.mockResolvedValue(project);
    repo.isActiveAdmin.mockResolvedValue(false);
    repo.update.mockResolvedValue(true);
    repo.delete.mockResolvedValue(true);
    service = new ArchiveService(repo as never);
  });

  it.each([['작성자', 'owner'], ['참여 부원', 'part']])('%s는 수정·삭제할 수 있다 (운영진 조회 없이)', async (_label, actor) => {
    await service.updateProject('p1', { title: 't' }, actor);
    await service.deleteProject('p1', actor);
    expect(repo.update).toHaveBeenCalledWith('p1', { title: 't' });
    expect(repo.delete).toHaveBeenCalledWith('p1');
    expect(repo.isActiveAdmin).not.toHaveBeenCalled();
  });

  it('작성자도 참여 부원도 아닌 운영진은 삭제만 할 수 있고 수정은 403', async () => {
    repo.isActiveAdmin.mockResolvedValue(true);
    await expect(service.updateProject('p1', { title: 't' }, 'admin')).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();

    await service.deleteProject('p1', 'admin');
    expect(repo.isActiveAdmin).toHaveBeenCalledWith('admin');
    expect(repo.delete).toHaveBeenCalled();
  });

  it('관련 없는 일반 회원은 403이고 저장소를 바꾸지 않는다', async () => {
    await expect(service.updateProject('p1', { title: 't' }, 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteProject('p1', 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('작성자 정보가 없는 예전 글은 참여 부원과 운영진만 가능 (null 작성자와 null 사용자를 같은 사람으로 보지 않는다)', async () => {
    repo.findById.mockResolvedValue({ ...project, createdBy: null });
    await expect(service.deleteProject('p1', 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
    await service.deleteProject('p1', 'part');
    expect(repo.delete).toHaveBeenCalledTimes(1);
  });

  it('없는 아카이브는 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.updateProject('nope', {}, 'owner')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteProject('nope', 'owner')).rejects.toBeInstanceOf(NotFoundException);
  });
});
