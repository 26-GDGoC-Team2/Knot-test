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
    link: n.link ?? null,
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
