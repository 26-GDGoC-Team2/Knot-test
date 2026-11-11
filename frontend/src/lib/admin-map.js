// ─────────────────────────────────────────────
// 운영진 관리 (REQ-028·029): 서버 /admin API 연결 (운영진만 쓸 수 있어요)
// - 부원 목록: 이름·이메일·권한(ADMIN/MEMBER)만 와요 (희망 역할은 부원 목록에서 채워요)
// - 가입 코드: 보안상 서버는 코드 원문을 저장된 상태로 돌려주지 않아요 → 새로 만들 때만 원문을 볼 수 있어요
// ─────────────────────────────────────────────
import { api } from "./api"

const ROLE_REASON = "운영진 관리 화면에서 변경" // 서버가 권한 변경 이유를 꼭 받아서 기본 문구를 보내요

export async function fetchAdminMembers() {
  const data = await api("/admin/members")
  return (data?.members ?? []).map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role }))
}

export const changeMemberRole = (userId, role) =>
  api(`/admin/members/${userId}/role`, { method: "PATCH", body: { role, reason: ROLE_REASON } })

export const setMemberGraduation = (userId, isGraduated) =>
  api(`/admin/members/${userId}/graduation`, { method: "PATCH", body: { isGraduated } })

// 강제 탈퇴 (서버가 이유를 꼭 받아요). 운영진은 서버가 막아요 → 먼저 일반으로 바꿔야 해요
export const forceWithdrawMember = (userId, reason) =>
  api(`/admin/members/${userId}`, { method: "DELETE", body: { reason } })

// 마지막으로 코드를 만든 시간 (원문은 안 와요). 한 번도 안 만들었으면 null
export async function fetchJoinCodeInfo() {
  const data = await api("/admin/join-code")
  return data?.joinCode ? { createdAt: data.joinCode.createdAt } : null
}

// 새 코드 만들기 → { code, createdAt } (이전 코드는 바로 막혀요)
export async function generateJoinCode() {
  const data = await api("/admin/join-code", { method: "POST" })
  return { code: data.code, createdAt: new Date().toISOString() }
}
