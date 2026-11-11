// ─────────────────────────────────────────────
// 프로필: 화면(이름 문자열) ↔ 서버(번호 ID) 변환 (시험 연동용)
// 선택 목록은 서버가 정해요. 로그인 후 한 번 받아서 화면 목록(data.js)을 서버 목록으로 맞춰요.
// ─────────────────────────────────────────────
import { api } from "./api"
import { ROLES, SKILLS, INTERESTS } from "../data"

let options = null

function replaceAll(target, names) {
  target.splice(0, target.length, ...names) // 같은 배열을 유지해서 이미 import한 곳에도 반영돼요
}

// 역할/기술/관심 분야 목록 (한 번만 받아 둠)
export async function loadOptions() {
  if (options) return options
  options = await api("/profiles/options")
  replaceAll(ROLES, options.roles.map((r) => r.name))
  replaceAll(SKILLS, options.skills.map((s) => s.name))
  replaceAll(INTERESTS, options.interests.map((i) => i.name))
  return options
}

const idOf = (list, name) => list.find((o) => o.name.toLowerCase() === name.toLowerCase())?.id

// 화면 프로필 → 서버 저장 요청 (목록에 없는 기술은 직접 입력 기술로)
export function toProfileRequest(p) {
  const skillIds = []
  const customSkills = []
  for (const name of p.skills ?? []) {
    const id = idOf(options.skills, name)
    if (id) skillIds.push(id)
    else customSkills.push(name)
  }
  return {
    name: p.name,
    roleIds: (p.roles ?? []).map((n) => idOf(options.roles, n)).filter(Boolean),
    skillIds,
    customSkills,
    interestIds: (p.interests ?? []).map((n) => idOf(options.interests, n)).filter(Boolean),
    available: Boolean(p.available),
    availableFrom: p.available && p.availableFrom ? p.availableFrom : null,
    bio: p.bio?.trim() || null,
    githubUrl: p.github?.trim() || null,
  }
}

// ── 프로젝트 경험 ──
// 종류: 서버 OFFICIAL/MATCHED/PERSONAL ↔ 화면 이름. 직접 등록·수정·삭제는 '본인 입력'(PERSONAL)만 돼요
const EXP_TYPE = { OFFICIAL: "동아리 프로젝트", MATCHED: "동아리원 팀", PERSONAL: "본인 입력" }

// 기간: 시작·종료 월(YYYY-MM) → 화면 표시 글자 ("2026.03–06", "2025.11–2026.02", "2026.03–진행 중")
export function periodText({ start, end, ongoing }) {
  if (!start) return ""
  const [sy, sm] = start.split("-")
  if (ongoing) return `${sy}.${sm}–진행 중`
  if (!end) return `${sy}.${sm}`
  const [ey, em] = end.split("-")
  return ey === sy ? `${sy}.${sm}–${em}` : `${sy}.${sm}–${ey}.${em}`
}

// 서버 프로젝트 경험 → 화면 (서버 날짜 YYYY-MM-DD 중 월까지만 써요, 종료일이 없으면 진행 중)
export function expFromServer(e) {
  const start = e.startedOn?.slice(0, 7) ?? ""
  const end = e.endedOn?.slice(0, 7) ?? ""
  const ongoing = Boolean(start) && !end
  return {
    id: e.id,
    name: e.name,
    type: EXP_TYPE[e.type] ?? "본인 입력",
    start,
    end,
    ongoing,
    period: periodText({ start, end, ongoing }),
    role: e.roleDesc ?? "",
    archiveId: e.archiveId ?? null, // 아카이브에서 가져온 경험이면 그 아카이브 id (서버 준비되면 와요)
    skills: e.skills.map((x) => x.name),
    description: e.description ?? "",
    link: e.link ?? "",
    isPublic: e.isPublic,
  }
}

// 화면 프로젝트 → 서버 저장 요청 (월은 1일로 보내요. 목록에 없는 기술은 빠져요)
function expToServer(f) {
  return {
    name: f.name.trim(),
    startedOn: f.start ? `${f.start}-01` : null,
    endedOn: !f.ongoing && f.end ? `${f.end}-01` : null,
    roleDesc: f.role || null,
    description: f.description?.trim() || null,
    link: f.link?.trim() || null,
    isPublic: Boolean(f.isPublic),
    skillIds: (f.skills ?? []).map((n) => idOf(options.skills, n)).filter(Boolean),
  }
}

export async function createExperience(f) {
  await loadOptions()
  return expFromServer(await api("/profiles/me/experiences", { method: "POST", body: expToServer(f) }))
}
export async function updateExperience(id, f) {
  await loadOptions()
  return expFromServer(await api(`/profiles/me/experiences/${id}`, { method: "PUT", body: expToServer(f) }))
}
export async function setExperienceVisibility(id, isPublic) {
  return expFromServer(await api(`/profiles/me/experiences/${id}/visibility`, { method: "PATCH", body: { isPublic } }))
}
// 아카이브 프로젝트를 내 경험으로 가져오기 (복사 · 아카이브 원본은 안 바뀌어요)
// ⚠️ 서버 API 준비 전: POST /profiles/me/experiences/import { archiveId } 로 맞춰 둠 (백엔드와 주소 확정 필요)
export async function importExperience(archiveId) {
  return expFromServer(await api("/profiles/me/experiences/import", { method: "POST", body: { archiveId } }))
}

export async function deleteExperience(id) {
  await api(`/profiles/me/experiences/${id}`, { method: "DELETE" })
}

// 서버 프로필 → 화면 프로필 (본인은 전체 프로젝트, 다른 부원은 공개한 프로젝트만 와요)
export function fromProfileResponse(r) {
  return {
    name: r.name,
    roles: r.roles.map((x) => x.name),
    skills: r.skills.map((x) => x.name),
    interests: r.interests.map((x) => x.name),
    available: r.available,
    availableFrom: r.availableFrom ?? "",
    github: r.githubUrl ?? "",
    bio: r.bio ?? "",
    projects: (r.experiences ?? []).map(expFromServer),
  }
}

// 다른 부원 프로필 상세 (GitHub, 공개 프로젝트 포함)
export async function fetchMemberProfile(userId) {
  return fromProfileResponse(await api(`/profiles/${userId}`))
}

export async function fetchMyProfile() {
  return fromProfileResponse(await api("/profiles/me"))
}

export async function saveMyProfile(profile) {
  await loadOptions()
  const saved = await api("/profiles/me", { method: "PUT", body: toProfileRequest(profile) })
  return fromProfileResponse(saved)
}
