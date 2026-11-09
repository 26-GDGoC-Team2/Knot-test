// 프로필 모듈 정책 값. 정책이 바뀌면 이 파일만 고치면 된다.
export const PROFILE_LIMITS = {
  NAME_MAX: 50, // 실명
  BIO_MAX: 1000, // 자기소개
  GITHUB_URL_MAX: 200,
  MAX_ROLE_IDS: 10,
  MAX_SKILL_IDS: 30, // 선택 목록에서 고르는 기술 수
  MAX_INTEREST_IDS: 20,
  CUSTOM_SKILL_MAX_LEN: 30, // 직접 입력 기술 이름 길이
  MAX_CUSTOM_SKILLS: 5, // 프로필당 직접 입력 기술 수 (남용 방지)
  MAX_EXPERIENCES: 50, // 회원당 프로젝트 경험 수 (남용 방지)
  EXPERIENCE_NAME_MAX: 100,
  EXPERIENCE_ROLE_DESC_MAX: 100,
  EXPERIENCE_DESC_MAX: 2000,
  EXPERIENCE_LINK_MAX: 500,
  MAX_EXPERIENCE_SKILLS: 20,
  SEARCH_KEYWORD_MAX: 50,
} as const;
