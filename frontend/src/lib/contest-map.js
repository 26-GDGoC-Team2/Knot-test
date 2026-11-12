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

export async function fetchCompetitions() {
  const limit = 100
  const first = await api(`/competitions?page=1&limit=${limit}`)
  const pages = Math.max(1, Math.ceil((first?.total ?? 0) / limit))
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => api(`/competitions?page=${i + 2}&limit=${limit}`)),
  )
  return [first, ...rest].flatMap((r) => r?.competitions ?? []).map(fromServer)
}
