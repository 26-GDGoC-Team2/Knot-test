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

// 서버 프로필 → 화면 프로필
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
  }
}

export async function fetchMyProfile() {
  return fromProfileResponse(await api("/profiles/me"))
}

export async function saveMyProfile(profile) {
  await loadOptions()
  const saved = await api("/profiles/me", { method: "PUT", body: toProfileRequest(profile) })
  return fromProfileResponse(saved)
}
