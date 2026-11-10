// ─────────────────────────────────────────────
// 아카이브: 서버 형식 → 화면 형식 변환 (시험 연동용)
// 서버(club_projects)에는 목록·상세 조회만 있어요. 등록·수정은 아직 이 브라우저에만 저장돼요
// - 서버엔 진행 기간·링크·등록한 사람이 없어서 빈 값으로 둬요
// - 목록 응답엔 참여 부원이 없어서, 상세까지 같이 받아요 (시험용이라 최대 50건)
// ─────────────────────────────────────────────
import { api } from "./api"
import { ME } from "../data"

function fromServer(p, myId) {
  return {
    id: p.id,
    type: "gdgoc", // 서버 표가 동아리 프로젝트(club_projects)라서
    gen: p.cohort ? `${p.cohort}기` : "",
    start: "",
    end: "",
    createdBy: null,
    title: p.title,
    description: p.description ?? "",
    category: p.category ?? "",
    skills: p.techStacks ?? [],
    // 부원은 id로, 앱 밖 인원(userId 없음)은 이름으로 보여 줘요
    members: (p.members ?? []).map((m) =>
      m.userId ? { id: m.userId === myId ? ME : m.userId, name: m.name, role: m.role } : { name: m.name, role: m.role, external: true },
    ),
    links: [],
  }
}

export async function fetchArchives(myId) {
  const list = await api("/archive?limit=50")
  const details = await Promise.all((list.projects ?? []).map((p) => api(`/archive/${p.id}`)))
  return details.map((d) => fromServer(d, myId))
}
