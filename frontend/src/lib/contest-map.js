// ─────────────────────────────────────────────
// 공모전 (REQ-033): 서버 GET /competitions 연결 (위비티에서 모아 온 목록)
// - 서버: { competitions: [...], total, page, limit } → 끝까지 나눠 받아요
// - 이름 맞추기: organizer → host, startDate → start(없을 수 있음), endDate → end, sourceUrl → url
// - 카테고리는 위비티 분류 그대로 써요 (필터 탭도 받아 온 카테고리로 만들어요)
// - 마감된 공모전도 다음 크롤링 전까지는 목록에 '접수 마감'으로 남고, 새로 모으면 서버에서 빠져요
// ─────────────────────────────────────────────
import { api } from "./api"

function fromServer(c) {
  return {
    id: String(c.id),
    category: c.category ?? "기타",
    title: c.title,
    host: c.organizer ?? "",
    start: c.startDate ?? "",
    end: c.endDate,
    url: c.sourceUrl,
  }
}

// 서버 API가 준비되기 전에 보여 줄 예시 (화면에 '예시'라고 표시해요 · 위비티 분류 모양으로)
export const EXAMPLE_CONTESTS = [
  { id: "EX1", category: "웹/모바일/IT", title: "[예시] 대학생 웹·앱 서비스 개발 공모전", host: "○○재단", start: "2026-11-01", end: "2026-12-15", url: "https://www.wevity.com" },
  { id: "EX2", category: "아이디어/기획", title: "[예시] 캠퍼스 문제 해결 아이디어 챌린지", host: "○○대학교", start: "2026-11-05", end: "2026-11-28", url: "https://www.wevity.com" },
  { id: "EX3", category: "디자인", title: "[예시] 공공서비스 UX/UI 디자인 공모전", host: "○○진흥원", start: "", end: "2026-12-05", url: "https://www.wevity.com" },
  { id: "EX4", category: "과학/공학", title: "[예시] AI 데이터 분석 경진대회", host: "○○연구원", start: "2026-10-20", end: "2026-11-20", url: "https://www.wevity.com" },
  { id: "EX5", category: "웹/모바일/IT", title: "[예시] 핀테크 서비스 해커톤", host: "○○은행", start: "2026-10-01", end: "2026-11-05", url: "https://www.wevity.com" },
]

export async function fetchCompetitions() {
  const limit = 100
  const first = await api(`/competitions?page=1&limit=${limit}`)
  const pages = Math.max(1, Math.ceil((first?.total ?? 0) / limit))
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => api(`/competitions?page=${i + 2}&limit=${limit}`)),
  )
  return [first, ...rest].flatMap((r) => r?.competitions ?? []).map(fromServer)
}
