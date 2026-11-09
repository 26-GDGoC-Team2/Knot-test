// ─────────────────────────────────────────────
// AI 추천 (임시 로직)
// 실제로는 백엔드에서 임베딩 유사도까지 계산해서 내려줌.
// 여기서는 정의서 REQ-015·016·018 구조만 흉내 냄:
//   1단계 필터 → 2단계 유사도(기술·관심 분야) → 3단계 보조 지표(수료·프로젝트)
// ─────────────────────────────────────────────
import { members } from "../data"
import { overlap, roleLeft } from "./helpers"

const WEIGHT = { skill: 0.45, interest: 0.35, extra: 0.2 } // 보조 지표 상한 20%

// 기본 추천 조건: 자리가 남은 모집 역할 + 모집글의 필수·우대 기술
export function defaultCondition(post) {
  return {
    roles: post.desiredRoles.filter((r) => roleLeft(post, r) > 0),
    required: post.requiredSkills ?? [],
    preferred: post.preferredSkills ?? [],
  }
}

// 모집글에 맞는 부원 후보 (REQ-015) — 점수 높은 순으로 전부 (화면에서 5명씩 끊어서 보여 줘요)
// cond: { roles, required, preferred } — '조건 바꿔 다시 추천'에서 바꾼 조건 (없으면 기본 조건)
export function recommendMembers(post, applications, cond = defaultCondition(post)) {
  const contacted = applications
    .filter((a) => a.postId === post.id)
    .flatMap((a) => [a.fromId, a.toId])

  return members
    // 1단계: 조건 필터
    .filter((m) => m.id !== post.authorId)
    .filter((m) => !post.team.includes(m.id))
    .filter((m) => !contacted.includes(m.id))
    .filter((m) => m.available)
    .filter((m) => !m.availableFrom || m.availableFrom <= post.endDate)
    .filter((m) => overlap(m.roles, cond.roles).length > 0)
    .map((m) => {
      const req = overlap(m.skills, cond.required)
      const pref = overlap(m.skills, cond.preferred)
      const interests = overlap(m.interests, post.interests)

      // 2단계: 유사도
      const skillTotal = cond.required.length * 2 + cond.preferred.length
      const skillScore = skillTotal ? (req.length * 2 + pref.length) / skillTotal : 0
      const interestScore = post.interests.length ? interests.length / post.interests.length : 0

      // 3단계: 보조 지표
      const clubProject = m.projects.some((p) => p.type !== "본인 입력")
      const extraScore = (m.completedGens?.length ? 0.5 : 0) + (clubProject ? 0.5 : 0)

      const score =
        WEIGHT.skill * skillScore + WEIGHT.interest * interestScore + WEIGHT.extra * extraScore

      const reasons = [
        ...[...req, ...pref].slice(0, 2).map((s) => `${s} 일치`),
        ...interests.slice(0, 1).map((i) => `${i} 관심`),
        ...(clubProject ? ["프로젝트 경험"] : []),
        ...(m.completedGens?.length ? ["수료"] : []),
      ]

      return { member: m, score, reasons, role: overlap(m.roles, cond.roles)[0] }
    })
    // AI팀 방식: 1단계 조건(Hard Filter)을 통과한 사람은 점수가 낮아도 순위에 넣어요
    .sort((a, b) => b.score - a.score)
}

// 나에게 맞는 모집글 점수 (REQ-017)
export function matchPost(user, post) {
  const roles = overlap(user.roles, post.desiredRoles)
  const skills = overlap(user.skills, [...post.requiredSkills, ...post.preferredSkills])
  const interests = overlap(user.interests, post.interests)
  const score = (roles.length ? 2 : 0) + skills.length + interests.length
  const reasons = [
    ...skills.slice(0, 1).map((s) => `${s} 일치`),
    ...interests.slice(0, 1).map((i) => `${i} 관심`),
  ]
  return { score, reasons, isMatch: roles.length > 0 && (skills.length > 0 || interests.length > 0) }
}
