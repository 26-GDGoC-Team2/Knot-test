import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ActivityRepository } from './activity.repository';

const GRADUATION_CRITERIA = {
  PROJECT: 1,
  SESSION_OR_CONTEST: 4,
  STUDY: 1,
};

@Injectable()
export class ActivityService {
  constructor(private readonly activityRepository: ActivityRepository) {}

  async getMyActivity(userId: string) {
    const summary = await this.activityRepository.getActivitySummary(userId);
    const records = await this.activityRepository.getParticipationRecords(userId);

    const projectCount = summary?.projectCount ?? 0;
    const sessionCount = summary?.sessionCount ?? 0;
    const contestCount = summary?.contestCount ?? 0;
    const studyCount = summary?.studyCount ?? 0;
    const totalScore = summary?.totalScore ?? 0;
    const isGraduated = summary?.isGraduated ?? false;
    const sessionContestCount = sessionCount + contestCount;

    const checklist = {
      project: {
        required: GRADUATION_CRITERIA.PROJECT,
        current: projectCount,
        completed: projectCount >= GRADUATION_CRITERIA.PROJECT,
      },
      sessionOrContest: {
        required: GRADUATION_CRITERIA.SESSION_OR_CONTEST,
        current: sessionContestCount,
        completed: sessionContestCount >= GRADUATION_CRITERIA.SESSION_OR_CONTEST,
      },
      study: {
        required: GRADUATION_CRITERIA.STUDY,
        current: studyCount,
        completed: studyCount >= GRADUATION_CRITERIA.STUDY,
      },
    };

    return {
      checklist,
      totalScore,
      isGraduated,
      isEligibleForGraduation:
        checklist.project.completed &&
        checklist.sessionOrContest.completed &&
        checklist.study.completed,
      records,
    };
  }

  async getGraduationStatus(targetUserId: string) {
    const isGraduated = await this.activityRepository.getGraduationStatus(targetUserId);
    if (isGraduated === null) throw new NotFoundException('존재하지 않는 사용자입니다.');
    return { isGraduated };
  }

  async addRecord(
    userId: string,
    activityType: string,
    activityName: string,
    participatedAt: Date,
  ): Promise<void> {
    const validTypes = ['PROJECT', 'SESSION', 'CONTEST', 'STUDY'];
    if (!validTypes.includes(activityType)) {
      throw new ForbiddenException('유효하지 않은 활동 유형입니다.');
    }
    await this.activityRepository.addParticipationRecord(
      userId, activityType, activityName, participatedAt,
    );
    await this.activityRepository.upsertActivityScore(userId);
  }
}