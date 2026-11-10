import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';
import { AdminRepository } from './admin.repository';
import { ChangeRoleDto, ForceWithdrawDto } from './admin.dto';
import { createHash, randomInt } from 'node:crypto';
import { encryptJoinCode } from '../../common/join-code-crypto';

// 헷갈리는 문자(0/O, 1/I)를 뺀 가입 코드용 문자. 8자리면 약 1조 가지
const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 8;

export const createJoinCodeText = (): string =>
  Array.from({ length: JOIN_CODE_LENGTH }, () => JOIN_CODE_CHARS[randomInt(JOIN_CODE_CHARS.length)]).join('');

const hashJoinCode = (code: string): string => createHash('sha256').update(code).digest('hex');

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

    // 가입 코드 발급: 사람이 입력할 수 있는 랜덤 코드를 만들어 join_codes 에 활성 코드로 저장한다.
  // (인증 모듈은 join_codes 의 활성 코드만 읽어 검증한다. 이전 코드는 비활성화된다)
  async generateJoinCode(actorId: string) {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24시간 (참고용: 검증 시 만료는 확인하지 않음)
    const code = createJoinCodeText();

    await this.database.transaction(async (tx) => {
      // 같은 트랜잭션 안에서 기존 활성 코드 비활성화 + 새 코드 저장 (활성 코드는 항상 1개)
      await this.adminRepository.replaceActiveJoinCode(encryptJoinCode(code), actorId, tx);
      // 이력에는 원문 대신 SHA-256 해시만 남긴다
      await this.adminRepository.insertJoinCodeHistory(hashJoinCode(code), actorId, expiresAt, tx);
      await this.adminRepository.insertAuditLog(
        actorId,
        'GENERATE_JOIN_CODE',
        'system',
        'join_code',
        { expiresAt: expiresAt.toISOString() },
        tx,
      );
    });

    // 원문 코드는 이 응답에서만 볼 수 있다
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