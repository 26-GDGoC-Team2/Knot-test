// 추천 모듈 보조 규칙: 역할명 변환, 신규부원 기준 (순수 함수만 둔다)

// 정책 1: 가입 인증(join_verified_at) 후 이 기간 이내이고 수료 전이면 신규부원
export const NEW_MEMBER_DAYS = 30;

// 정책 2: DB 역할명 → AI 서버 표준 역할명 (AI 서버는 PM/디자인/FE/BE/AI/앱만 안다)
export const ROLE_NAME_TO_AI: Readonly<Record<string, string>> = {
  'AI/Data': 'AI',
  기획: 'PM', // 마이그레이션 0009에서 PM을 '기획'으로 이름 변경함
};

// DB 역할명을 AI 표준 역할명으로 변환. 별칭이 없으면 그대로 쓴다
export function toAiRole(dbRoleName: string): string {
  return ROLE_NAME_TO_AI[dbRoleName] ?? dbRoleName;
}

// 같은 AI 표준 역할로 변환되는 DB 역할명 전체 (예: 'AI' → ['AI', 'AI/Data'])
export function dbRoleNamesFor(aiRoleName: string): string[] {
  const names = new Set<string>([aiRoleName]);
  for (const [db, ai] of Object.entries(ROLE_NAME_TO_AI)) {
    if (ai === aiRoleName) names.add(db);
  }
  return [...names];
}

// AI 서버가 아는 표준 역할명
export const STANDARD_AI_ROLES: readonly string[] = ['PM', '디자인', 'FE', 'BE', 'AI', '앱'];

// 경험의 역할 결정: 확정 팀원 역할 → 직접 적은 역할(표준 역할명과 정확히 일치할 때만). 그 외는 추측하지 않고 null
export function resolveExperienceRole(memberRole: string | null | undefined, roleDesc: string | null | undefined): string | null {
  for (const raw of [memberRole, roleDesc]) {
    const t = typeof raw === 'string' ? raw.trim() : '';
    if (!t) continue;
    const ai = toAiRole(t);
    if (STANDARD_AI_ROLES.includes(ai)) return ai;
  }
  return null;
}

// 문자열 배열에서 공백·중복을 제거한다 (AI 서버는 빈 문자열을 거부한다)
export function cleanStrings(values: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!values) return [];
  const out = new Set<string>();
  for (const v of values) {
    const t = typeof v === 'string' ? v.trim() : '';
    if (t) out.add(t);
  }
  return [...out];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
