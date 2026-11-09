// ─────────────────────────────────────────────
// 활동 점수 · 수료 조건 (GDGoC OT 자료 "동아리 활동점수 기준표")
// 수료 기준 점수는 따로 없고, 점수는 계속 누적돼요.
// ─────────────────────────────────────────────

// 활동 점수 항목 (같은 항목도 여러 번 추가 가능)
// kind: "range" = 직접 점수 입력(팀장 평가) / "option" = 종류 고르기 / "fixed" = 1회당 고정 점수
export const ACTIVITY_CATEGORIES = [
  { key: "project", label: "프로젝트 진행", desc: "프로젝트마다 팀장 평가에 따라 0~20점", kind: "range", max: 20, itemLabel: "프로젝트", placeholder: "프로젝트명 (예: 동아리 출석 체크 웹)", sub: "팀장 평가 점수" },
  {
    key: "external", label: "대외활동", desc: "대기업 20점 · 그 외 10점", kind: "option", itemLabel: "대외활동", placeholder: "활동명 (예: ○○ 대학생 서포터즈)",
    options: [{ value: "big", label: "대기업", score: 20 }, { value: "etc", label: "그 외", score: 10 }],
  },
  {
    key: "award", label: "입상", desc: "1등 20점 · 2등 15점 · 3등 10점", kind: "option", itemLabel: "입상", placeholder: "대회명 (예: ○○ 해커톤)",
    options: [{ value: "1", label: "1등", score: 20 }, { value: "2", label: "2등", score: 15 }, { value: "3", label: "3등", score: 10 }],
  },
  {
    key: "paper", label: "논문 작성", desc: "KCI 20점 · SCI 40점", kind: "option", itemLabel: "논문", placeholder: "논문 제목",
    options: [{ value: "kci", label: "KCI", score: 20 }, { value: "sci", label: "SCI", score: 40 }],
  },
  {
    key: "cert", label: "자격증 취득", desc: "국가공인·국가기술 자격증 20점", kind: "option", itemLabel: "자격증", placeholder: "자격증명 (예: 정보처리기사)",
    options: [{ value: "official", label: "국가공인", score: 20 }, { value: "tech", label: "국가기술", score: 20 }],
  },
  { key: "study", label: "스터디 운영", desc: "스터디 운영자만 해당 · 1회 10점", kind: "fixed", score: 10, itemLabel: "스터디 운영", placeholder: "스터디명 (예: 알고리즘 스터디)" },
]

export const EMPTY_ACTIVITY = { sessions: 0, studies: 0, items: [] }

// 항목 하나의 점수
export function itemScore(item) {
  const cat = ACTIVITY_CATEGORIES.find((c) => c.key === item.cat)
  if (!cat) return 0
  if (cat.kind === "range") return item.score ?? 0
  if (cat.kind === "fixed") return cat.score
  return cat.options.find((o) => o.value === item.option)?.score ?? 0
}

// 누적 활동 점수
export function totalScore(activity = EMPTY_ACTIVITY) {
  return activity.items.reduce((sum, it) => sum + itemScore(it), 0)
}

// 수료 조건 3가지
export function conditions(activity = EMPTY_ACTIVITY) {
  const projects = activity.items.filter((it) => it.cat === "project").length
  return [
    { label: "프로젝트 1개 이상 참여", value: projects, goal: 1, unit: "개" },
    { label: "정규세션 · 대회 4회 이상 참여", value: activity.sessions, goal: 4, unit: "회" },
    { label: "스터디 1회 이상 참여", value: activity.studies, goal: 1, unit: "회" },
  ].map((c) => ({ ...c, done: c.value >= c.goal }))
}

// 수료 조건을 다 채웠는지
export function isCompleted(activity = EMPTY_ACTIVITY) {
  return conditions(activity).every((c) => c.done)
}
