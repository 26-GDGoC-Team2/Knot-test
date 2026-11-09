import { ME, members } from "../data"

// "2026-11-05" → "11.05"
export function shortDate(date) {
  if (!date) return ""
  return date.slice(5).replace("-", ".")
}

// 역할별 정원 (예: { FE: 2, BE: 1 })
// roleCounts: 역할별 인원 (팀장 자리 포함) / teamRoles: 확정 팀원별 역할 { 팀원id: "FE" }
// 예) 팀장 FE + FE 1명 모집 → roleCounts.FE = 2, 처음엔 팀장이 한 자리를 채운 상태
// 팀장을 뺀 확정 팀원만 센 인원
export function memberFilled(post, role) {
  return Object.values(post.teamRoles ?? {}).filter((r) => r === role).length
}
// 팀장까지 포함해서 찬 자리
export function roleFilled(post, role) {
  return memberFilled(post, role) + (post.leaderRole === role ? 1 : 0)
}
// 팀 전체 인원 (팀장 포함) → "1/4"처럼 보여 줄 때
export function teamSize(post) {
  return post.team.length + 1
}
export function roleLeft(post, role) {
  return Math.max(0, (post.roleCounts?.[role] ?? 0) - roleFilled(post, role))
}
export function roleOpen(post, role) {
  return !post.closed && !isPeriodOver(post) && roleLeft(post, role) > 0
}

// 진행 기간(종료일)이 지났는지 → 지났으면 자동으로 모집 마감
export function isPeriodOver(post) {
  return Boolean(post.endDate) && post.endDate < today()
}

// 모집 중인지: 마감 안 했고, 진행 기간이 안 지났고, 아직 빈자리가 남은 역할이 하나라도 있을 때
// (모든 역할이 차거나 종료일이 지나면 자동 모집 완료)
export function isOpen(post) {
  if (post.closed) return false
  if (isPeriodOver(post)) return false
  if (!post.roleCounts) return teamSize(post) < post.recruitCount
  return post.desiredRoles.some((r) => roleLeft(post, r) > 0)
}

// id로 사람 찾기 (나 포함)
export function getPerson(user, id) {
  if (id === ME) return user
  return members.find((m) => m.id === id)
}

// 두 배열에서 겹치는 값
export function overlap(a = [], b = []) {
  return a.filter((x) => b.includes(x))
}

// 역할별 색 점 (G안)
export const roleDot = {
  FE: "bg-g-blue",
  BE: "bg-g-green",
  디자인: "bg-g-red",
  기획: "bg-g-yellow",
}

// 오늘 날짜 "2026-10-27"
export function today() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

// 수락·거절할 때 물어볼 문구
export function confirmText(a, name, accept, changing) {
  const what = a.type === "apply" ? "지원" : "제안"
  if (!changing) {
    return accept
      ? { title: `${name}님의 ${what}을 수락하시겠습니까?`, desc: "수락하면 바로 한 팀이 돼요.", label: "수락" }
      : { title: `${name}님의 ${what}을 거절하시겠습니까?`, desc: "거절한 뒤에도 내역에서 취소할 수 있어요.", label: "거절", danger: true }
  }
  // 응답 되돌리기: 수락 취소 / 거절 취소 → 둘 다 다시 응답하지 않은 상태로
  return a.status === "accepted"
    ? { title: `${name}님의 ${what} 수락을 취소하시겠습니까?`, desc: "팀원에서 빠지고, 다시 응답하지 않은 상태로 돌아가요.", label: "수락 취소", danger: true }
    : { title: `${name}님의 ${what} 거절을 취소하시겠습니까?`, desc: "다시 응답하지 않은 상태로 돌아가요.", label: "거절 취소" }
}

// 수료한 기수 → "6기 수료", "5·6기 수료" (없으면 null = 수료 전)
export function completedText(gens = []) {
  if (!gens.length) return null
  const nums = gens.map((g) => parseInt(g, 10)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
  return `${nums.join("·")}기 수료`
}

// 이 지원·제안을 수락하면 마지막 자리가 차서 모집이 마감되는지 → 확인 창에 덧붙일 안내 (아니면 null)
// 마감되면 수락을 취소할 수 없어서 미리 알려요
export function closingNotice(post, app, applications) {
  if (!post || !post.roleCounts) return null
  const lastSeat = roleLeft(post, app.role) === 1 && post.desiredRoles.every((r) => r === app.role || roleLeft(post, r) === 0)
  if (!lastSeat) return null
  // 제안을 수락하는 경우 (남의 팀에 마지막으로 들어감)
  if (app.type === "propose") return "수락하면 이 팀의 모든 자리가 차서 모집이 마감돼요. 마감되면 수락을 취소할 수 없어요."
  // 내 글에 온 지원을 수락하는 경우
  const others = applications.filter((x) => x.postId === post.id && x.status === "pending" && x.id !== app.id).length
  return `수락하면 모든 자리가 차서 모집이 마감되고, 마감되면 수락을 취소할 수 없어요.${
    others > 0 ? ` 대기 중인 지원·제안 ${others}개는 자동으로 거절돼요.` : ""
  }`
}

// 알림은 최근 30일 것만 보여요 (홈 종 빨간 점도 같은 기준)
export const NOTI_KEEP_DAYS = 30
export function isRecentNoti(n) {
  return (new Date(today()) - new Date(n.date)) / 86400000 <= NOTI_KEEP_DAYS
}

// 화면에 보여 줄 알림인지: 최근 30일 + 매칭 알림인데 그 매칭이 지금 수락 상태가 아니면(수락 취소됨) 숨김
export function isVisibleNoti(n, applications = []) {
  if (!isRecentNoti(n)) return false
  const m = /^\/match\/(.+)$/.exec(n.link ?? "")
  if (!m) return true
  const app = applications.find((a) => a.id === m[1])
  return !!app && app.status === "accepted"
}

// 역할 뒤에 붙는 '로/으로' (예: FE로, BE로, 디자인으로, 기획으로)
// 한글로 끝나면 받침을 보고(받침 없거나 ㄹ이면 '로'), 영어(FE·BE 등)는 읽는 소리 기준으로 '로'
export function withRo(word = "") {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0) - 0xac00
  if (code >= 0 && code <= 11171) {
    const jong = code % 28
    return `${word}${jong === 0 || jong === 8 ? "로" : "으로"}`
  }
  // 영어로 끝나면: M·N으로 끝날 때만 '으로' (예: PM으로), 그 외는 '로' (FE로, BE로)
  return `${word}${/[mn]$/i.test(last) ? "으로" : "로"}`
}

// 링크 검사
// 오픈채팅: 카카오 오픈채팅 주소만 (https://open.kakao.com/...)
export function isKakaoOpenChat(url = "") {
  return /^https:\/\/open\.kakao\.com\/\S+$/.test(url.trim())
}
// 그 밖의 링크(GitHub, 결과물): https:// 로 시작하는 주소
export function isWebLink(url = "") {
  return /^https:\/\/[^\s/]+\.[^\s]+$/.test(url.trim())
}

// 작은따옴표 '제목' → ‘제목’ (휴대폰에서 여는 따옴표만 윗줄에 남고 제목이 다음 줄로 넘어가는 걸 막아요)
// 곧은 따옴표(')는 줄을 바꿔도 되는 글자로 취급돼서, 모양이 정해진 따옴표(‘ ’)로 바꿔 줘요
export function curlyQuotes(text = "") {
  return String(text).replace(/'([^']+)'/g, "\u2018$1\u2019")
}
