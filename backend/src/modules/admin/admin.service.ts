import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { lockAdminChanges } from '../../common/admin-lock';
import { DatabaseService } from '../../common/database.service';
import { UserService } from '../users/user.service';
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
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly database: DatabaseService,
    private readonly userService: UserService,
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

  // 강제 탈퇴: 본인 탈퇴와 같은 처리(모집글 완료·지원 취소·토큰 폐기·개인정보 삭제)를 하나의 트랜잭션으로 한다
  async forceWithdraw(
    targetUserId: string,
    dto: ForceWithdrawDto,
    actorId: string,
  ) {
    const result = await this.database.transaction(async (tx) => {
      // 운영진 수가 바뀔 수 있으므로 먼저 직렬화한 뒤 대상을 확인한다
      await lockAdminChanges(tx);
      const target = await this.adminRepository.findMemberById(targetUserId, tx);
      if (!target) throw new NotFoundException('존재하지 않는 멤버입니다.');
      if (target.role === 'ADMIN')
        throw new ForbiddenException('운영진은 강제 탈퇴할 수 없습니다.');

      const done = await this.userService.withdrawInTx(
        targetUserId,
        tx,
        () => new NotFoundException('존재하지 않는 멤버입니다.'),
      );
      // 감사 로그도 같은 트랜잭션: 탈퇴가 롤백되면 로그도 남지 않는다
      await this.adminRepository.insertAuditLog(
        actorId,
        'FORCE_WITHDRAW',
        'user',
        targetUserId,
        { reason: dto.reason, ...done },
        tx,
      );
      return done;
    });
    // 개인정보 없이 건수만 기록
    this.logger.log(
      `강제 탈퇴 처리 완료 (target=${targetUserId}, 모집글 완료 ${result.completedRecruitments}건, 지원/제안 취소 ${result.canceledApplications}건)`,
    );
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

    // 수료 지정과 감사 로그를 같은 트랜잭션으로 처리
    await this.database.transaction(async (tx) => {
      await this.adminRepository.setGraduationStatus(targetUserId, isGraduated, tx);
      await this.adminRepository.insertAuditLog(
        actorId,
        'SET_GRADUATION_STATUS',
        'user',
        targetUserId,
        { isGraduated },
        tx,
      );
    });
  }
}