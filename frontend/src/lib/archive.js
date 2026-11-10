// 아카이브 화면들이 같이 쓰는 작은 도구
import { getPerson } from "./helpers"

// "2026-03" ~ "2026-06" → "2026.03–06" (해가 다르면 "2025.09–2026.02")
export function periodText(start, end) {
  if (!start) return ""
  const [sy, sm] = start.split("-")
  if (!end) return `${sy}.${sm}–`
  const [ey, em] = end.split("-")
  return sy === ey ? `${sy}.${sm}–${em}` : `${sy}.${sm}–${ey}.${em}`
}

// 참여 부원 이름 (부원은 프로필 이름, 외부 인원은 입력한 이름)
export function archiveMemberName(user, m) {
  if (m.external) return m.name
  return getPerson(user, m.id)?.name || m.name || "탈퇴한 회원" // 서버 아카이브는 이름을 같이 줘요
}

// 내가 참여한 프로젝트인지 (수정 버튼 보이기용)
export function isMyArchive(archive, myId) {
  return archive.createdBy === myId || archive.members.some((m) => m.id === myId)
}
