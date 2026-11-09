import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';
import { AdminRepository } from './admin.repository';
import { ChangeRoleDto, ForceWithdrawDto } from './admin.dto';
import { encryptJoinCode } from '../../common/join-code-crypto';

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly database: DatabaseService,
  ) {}

  // 멤버 목록 조회
  async getMembers() {
    const members = await this.adminRepository.findAllMembers();
    return members;
  }

  // 역할 변경
  async changeRole(
    targetUserId: string,
    dto: ChangeRoleDto,
    actorId: string,
  ) {
    const target = await this.adminRepository.findMemberById(targetUserId);
    if (!target) throw new NotFoundException('존재하지 않는 멤버입니다.');

    await this.database.transaction(async () => {
      await this.adminRepository.updateRole(targetUserId, dto.role);
      await this.adminRepository.insertRoleHistory(
        targetUserId,
        actorId,
        target.role,
        dto.role,
        dto.reason,
      );
      await this.adminRepository.insertAuditLog(
        actorId,
        'CHANGE_ROLE',
        'user',
        targetUserId,
        { oldRole: target.role, newRole: dto.role, reason: dto.reason },
      );
    });
  }

  // 강제 탈퇴
  async forceWithdraw(
    targetUserId: string,
    dto: ForceWithdrawDto,
    actorId: string,
  ) {
    const target = await this.adminRepository.findMemberById(targetUserId);
    if (!target) throw new NotFoundException('존재하지 않는 멤버입니다.');
    if (target.role === 'ADMIN')
      throw new ForbiddenException('운영진은 강제 탈퇴할 수 없습니다.');

    await this.database.transaction(async () => {
      await this.adminRepository.withdrawMember(targetUserId);
      await this.adminRepository.insertAuditLog(
        actorId,
        'FORCE_WITHDRAW',
        'user',
        targetUserId,
        { reason: dto.reason },
      );
    });
  }

    // 가입 코드 발급
  async generateJoinCode(actorId: string) {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24시간
    const expiresAtStr = expiresAt.toISOString();
    const code = encryptJoinCode(expiresAtStr);

    await this.database.transaction(async () => {
      await this.adminRepository.insertJoinCodeHistory(code, actorId, expiresAt);
      await this.adminRepository.insertAuditLog(
        actorId,
        'GENERATE_JOIN_CODE',
        'system',
        'join_code',
        { expiresAt: expiresAtStr },
      );
    });

    return { code, expiresAt };
  }
    // 가입 코드 조회
  async getJoinCode() {
    return this.adminRepository.getJoinCode();
  }

  // 수료 여부 지정
  async setGraduationStatus(
    targetUserId: string,
    isGraduated: boolean,
    actorId: string,
  ): Promise<void> {
    const target = await this.adminRepository.findMemberById(targetUserId);
    if (!target) throw new NotFoundException('존재하지 않는 멤버입니다.');

    await this.database.transaction(async () => {
      await this.adminRepository.setGraduationStatus(targetUserId, isGraduated);
      await this.adminRepository.insertAuditLog(
        actorId,
        'SET_GRADUATION_STATUS',
        'user',
        targetUserId,
        { isGraduated },
      );
    });
  }
}