// ─────────────────────────────────────────────
// 아카이브: 서버 형식 ↔ 화면 형식 변환 (시험 연동용)
// - 구분: 화면 gdgoc/external ↔ 서버 category "GDGOC"/"EXTERNAL"
// - 기수: 화면 "7기" ↔ 서버 cohort 7 / 기간: 둘 다 "YYYY-MM"
// - 링크: 화면 { kind, url } ↔ 서버 { label, url } (label은 'GitHub', '배포 사이트' 같은 화면 이름)
// - 목록 응답엔 참여 부원·링크가 없어서, 상세까지 같이 받아요
// ─────────────────────────────────────────────
import { api } from "./api"
import { ME, LINK_KINDS } from "../data"

const kindOf = (label) => Object.keys(LINK_KINDS).find((k) => LINK_KINDS[k] === label) ?? "etc"
const genOf = (cohort) => (cohort ? `${cohort}기` : "")
const cohortOf = (gen) => (gen ? Number.parseInt(gen, 10) || null : null)
const toMe = (id, myId) => (id && id === myId ? ME : id)

function fromServer(p, myId) {
  return {
    id: p.id,
    type: p.category === "EXTERNAL" ? "external" : "gdgoc",
    gen: genOf(p.cohort),
    start: p.startedAt ?? "",
    end: p.endedAt ?? "",
    createdBy: toMe(p.createdBy, myId) ?? null,
    title: p.title,
    description: p.description ?? "",
    skills: p.techStacks ?? [],
    // 부원은 id로, 앱 밖 인원(userId 없음)은 이름으로 보여 줘요
    members: (p.members ?? []).map((m) =>
      m.userId ? { id: toMe(m.userId, myId), name: m.name, role: m.role } : { name: m.name, role: m.role, external: true },
    ),
    links: (p.links ?? []).map((l) => ({ kind: kindOf(l.label), url: l.url })),
  }
}

// 화면 입력 → 서버 저장 요청
// nameOf(id): 부원 id로 이름 찾기 (서버가 참여 부원 이름을 같이 저장해서, 탈퇴해도 이름이 남아요)
function toServer(f, myId, nameOf) {
  return {
    title: f.title,
    description: f.description || null,
    category: f.type === "external" ? "EXTERNAL" : "GDGOC",
    cohort: cohortOf(f.gen),
    startedAt: f.start || null,
    endedAt: f.end || null,
    techStacks: f.skills ?? [],
    members: (f.members ?? []).map((m) =>
      m.external
        ? { userId: null, name: m.name, role: m.role }
        : { userId: m.id === ME ? myId : m.id, name: nameOf(m.id) || m.name || "부원", role: m.role },
    ),
    links: (f.links ?? []).map((l) => ({ label: LINK_KINDS[l.kind] ?? "기타", url: l.url })),
  }
}

export async function fetchArchives(myId) {
  // 아카이브는 한 번에 최대 50개라, 전체 장 수만큼 이어서 받아요
  const first = await api("/archive?limit=50&page=1")
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, (first.pagination?.totalPages ?? 1) - 1) }, (_, i) => api(`/archive?limit=50&page=${i + 2}`)),
  )
  const list = [first, ...rest].flatMap((p) => p.projects ?? [])
  const details = await Promise.all(list.map((p) => api(`/archive/${p.id}`)))
  return details.map((d) => fromServer(d, myId))
}

export async function createArchive(fields, myId, nameOf) {
  return fromServer(await api("/archive", { method: "POST", body: toServer(fields, myId, nameOf) }), myId)
}
export async function updateArchiveOnServer(id, fields, myId, nameOf) {
  return fromServer(await api(`/archive/${id}`, { method: "PATCH", body: toServer(fields, myId, nameOf) }), myId)
}
