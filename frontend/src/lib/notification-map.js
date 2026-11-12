// ─────────────────────────────────────────────
// 알림: 서버 형식 ↔ 화면 형식 변환 (시험 연동용)
// 서버는 최근 30일 알림을 최신순으로 줘요. 화면은 한 줄 글자(text)만 써서 본문(body)을 우선 보여 줘요
// ─────────────────────────────────────────────
import { api, localDate } from "./api"

function fromServer(n) {
  return {
    id: n.id,
    type: n.type,
    text: n.body || n.title,
    date: localDate(n.created_at ?? n.createdAt),
    read: Boolean(n.is_read ?? n.isRead),
    // 서버 링크는 /recruitment/:id → 프론트 모집글 주소는 /posts/:id
    link: n.link ? n.link.replace(/^\/recruitment\//, "/posts/") : null,
  }
}

export async function fetchNotifications() {
  const list = await api("/notifications")
  return (list ?? []).map(fromServer)
}
export const markNotificationRead = (id) => api(`/notifications/${id}/read`, { method: "PATCH" })
export const markAllNotificationsRead = () => api("/notifications/read", { method: "PATCH" })
export const deleteNotification = (id) => api(`/notifications/${id}`, { method: "DELETE" })
export const deleteAllNotifications = () => api("/notifications", { method: "DELETE" })

// ── 알림 설정 ──
// 서버 칸: push_enabled / recruitment_noti / application_noti / system_noti / recruitment_range
// 모집 알림 범위: 화면 both·interest·role ↔ 서버 "BOTH"·"INTEREST"·"ROLE" (서버 기본값 "ALL"은 화면 기본값 both로 봐요)
const RANGE_TO = { both: "BOTH", interest: "INTEREST", role: "ROLE" }
const RANGE_FROM = { BOTH: "both", INTEREST: "interest", ROLE: "role" }

export async function fetchSettings() {
  const r = await api("/notifications/settings")
  if (!r) return null // 아직 저장한 적 없으면 화면 기본값 그대로
  return {
    push: r.push_enabled ?? true,
    notifyRecruit: r.recruitment_noti ?? true,
    notifyApply: r.application_noti ?? true,
    notifySystem: r.system_noti ?? true,
    notifyScope: RANGE_FROM[r.recruitment_range] ?? "both",
  }
}

export async function saveSettings(partial) {
  const body = {}
  if ("push" in partial) body.pushEnabled = partial.push
  if ("notifyRecruit" in partial) body.recruitmentNoti = partial.notifyRecruit
  if ("notifyApply" in partial) body.applicationNoti = partial.notifyApply
  if ("notifySystem" in partial) body.systemNoti = partial.notifySystem
  if ("notifyScope" in partial) body.recruitmentRange = RANGE_TO[partial.notifyScope] ?? "BOTH"
  if (Object.keys(body).length) await api("/notifications/settings", { method: "PATCH", body })
}
