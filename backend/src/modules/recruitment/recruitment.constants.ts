// 모집/지원 모듈 정책 값. 정책이 바뀌면 이 파일만 고치면 된다.
export const RECRUITMENT_LIMITS = {
  TITLE_MAX: 100,
  DESCRIPTION_MAX: 3000,
  OPEN_CHAT_URL_MAX: 500,
  MAX_ROLES: 10, // 모집글당 역할 수
  CAPACITY_MAX: 50, // 역할별 정원 상한 (작성자 포함)
  MAX_SKILLS: 20, // 필수/우대 각각
  MAX_INTERESTS: 20,
  SEARCH_KEYWORD_MAX: 50,
} as const;

// 지원/제안 한 줄 메시지 최대 길이 (DB 제약은 200자로 넉넉히 두고 실제 제한은 여기서 검사)
export const APPLICATION_MESSAGE_MAX = 50;
