// ─────────────────────────────────────────────
// AI 부원 추천 (백엔드 → AI 서버)
// GET /recommendations/:모집글id/roles/:역할id  (작성자만, 모집 중인 글만)
// - 한 번에 최대 10명 (1~5위, 6~10위). 신규 부원 포함 규칙·이미 연락한 사람 제외는 서버·AI가 처리해요
// - 조건을 바꿨으면 requiredSkills / preferredSkills 를 쉼표로 보내요 (빈 값 = 없음)
// ─────────────────────────────────────────────
import { api } from "./api"

export async function fetchAiRecommendations(postId, roleId, cond) {
  const q = new URLSearchParams()
  if (cond) {
    q.set("requiredSkills", cond.required.join(","))
    q.set("preferredSkills", cond.preferred.join(","))
  }
  const qs = q.toString()
  const d = await api(`/recommendations/${postId}/roles/${roleId}${qs ? `?${qs}` : ""}`)
  return (d?.candidates ?? [])
    .slice()
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .slice(0, 10)
    .map((c) => ({
      member: { id: c.userId, name: c.name, bio: c.bio ?? "", availableFrom: c.availableFrom ?? "" },
      role: c.roleName,
      score: c.score,
      // 추천 이유: { label: "기술", text: "React, Spring 일치" }
      reasons: (c.reasons ?? []).filter((r) => r && r.text).map((r) => ({ label: r.label ?? "", text: r.text })),
    }))
}
