// 회원 비즈니스 로직: 탈퇴(REQ-024)
import { Injectable, Logger } from '@nestjs/common';
import { lockAdminChanges } from '../../common/admin-lock';
import { AppException, ConflictError, UnauthorizedError } from '../../common/app.exception';
import { DatabaseService } from '../../common/database.service';
import { ErrorCode } from '../../common/error-code';
import { AuthRepository } from '../auth/auth.repository';
import { ApplicationRepository } from '../recruitment/application.repository';
import { RecruitmentRepository } from '../recruitment/recruitment.repository';
import { UserRepository } from './user.repository';

export interface WithdrawalResult {
  completedRecruitments: number; // 완료 처리된 모집글 수
  canceledApplications: number; // 취소된 지원/제안 수
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly users: UserRepository,
    private readonly recruitments: RecruitmentRepository,
    private readonly applications: ApplicationRepository,
    private readonly authRepo: AuthRepository,
  ) {}

  // 회원 탈퇴: 아래 모든 변경을 하나의 트랜잭션으로 처리한다. 하나라도 실패하면 전부 롤백
  async withdraw(userId: string): Promise<WithdrawalResult> {
    const result = await this.database.transaction(async (tx) => {
      // 1) 운영진 수 변경 직렬화 (마지막 운영진 동시 탈퇴 방지)
      await lockAdminChanges(tx);

      // 2) 대상 확인: 없거나 이미 탈퇴한 회원이면 거부
      const user = await this.users.findForWithdrawal(userId, tx);
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError();

      // 3) 마지막 운영진은 탈퇴할 수 없다
      if (user.role === 'ADMIN' && (await this.users.countOtherActiveAdmins(userId, tx)) === 0) {
        throw new AppException(ErrorCode.LAST_ADMIN);
      }

      // 4) 작성한 진행 중 모집글 완료 처리, 대기 중 지원/제안 취소
      const completedRecruitments = await this.recruitments.completeOpenByAuthor(userId, tx);
      const canceledApplications = await this.applications.cancelPendingInvolving(userId, tx);

      // 5) 모든 기기의 Refresh 토큰 폐기
      await this.authRepo.revokeAllRefreshTokens(userId, tx);

      // 6) 개인정보 삭제 (프로필, 역할/기술/관심 분야, 프로젝트 경험)
      await this.users.erasePersonalData(userId, tx);

      // 7) 행은 보존하고 상태만 변경, 이름/이메일 삭제 (확정 팀원/활동 이력 정합성 유지)
      if (!(await this.users.markWithdrawn(userId, tx))) throw new ConflictError();

      return { completedRecruitments, canceledApplications };
    });

    // 개인정보 없이 건수만 기록
    this.logger.log(
      `회원 탈퇴 처리 완료 (user=${userId}, 모집글 완료 ${result.completedRecruitments}건, 지원/제안 취소 ${result.canceledApplications}건)`,
    );
    return result;
  }
    // 수료 기수 조회
  async getGraduationCohort(userId: string): Promise<number | null> {
    return this.users.getGraduationCohort(userId);
  }

  // 수료 기수 저장/업데이트
  async updateGraduationCohort(userId: string, cohort: number): Promise<void> {
    await this.users.updateGraduationCohort(userId, cohort);
  }
}
