// ─────────────────────────────────────────────
// 모집글: 화면 형식 ↔ 서버 형식 변환 (시험 연동용)
// - 서버 정원(capacity)은 "작성자 포함", 화면 roleCounts는 "작성자 제외" 라서 팀장 역할만 1씩 차이가 나요.
// - 화면은 사람을 id로 찾기 때문에, 서버에서 받은 작성자/팀원을 members 목록에 넣어 둬요.
// ─────────────────────────────────────────────
import { api, localDate } from "./api"
import { loadOptions } from "./profile-map"
import { ME, members } from "../data"

// 서버 사용자 → 화면에서 쓰는 id (나는 ME). 처음 보는 사람은 members에 이름만 넣어 둠
function personId(user, myId) {
  if (user.id === myId) return ME
  if (!members.some((m) => m.id === user.id)) {
    members.push({
      id: user.id, name: user.name, roles: [], completedGens: [], skills: [], interests: [],
      available: true, availableFrom: "", github: "", bio: "", projects: [],
    })
  }
  return user.id
}

// 서버 모집글 상세 → 화면 모집글
export function postFromServer(d, myId) {
  const leaderRole = d.roles.find((r) => r.roleId === d.authorRoleId)?.roleName ?? d.members.find((m) => m.isLeader)?.roleName ?? ""
  const roleCounts = {}
  const desiredRoles = []
  for (const r of d.roles) {
    const n = r.capacity - (r.roleName === leaderRole ? 1 : 0) // 팀장 자리는 제외
    if (n > 0) {
      roleCounts[r.roleName] = n
      desiredRoles.push(r.roleName)
    }
  }
  // 역할별 기술: 서버가 역할마다 내려준 값을 화면 형식으로. 하나도 없으면 undefined (합친 목록으로 표시)
  const roleSkills = {}
  for (const r of d.roles) {
    const req = (r.requiredSkills ?? []).map((s) => s.name)
    const pref = (r.preferredSkills ?? []).map((s) => s.name)
    if (req.length || pref.length) roleSkills[r.roleName] = { required: req, preferred: pref }
  }
  const hasRoleSkills = Object.keys(roleSkills).length > 0
  for (const name of desiredRoles) if (hasRoleSkills && !roleSkills[name]) roleSkills[name] = { required: [], preferred: [] }
  const team = []
  const teamRoles = {}
  for (const m of d.members) {
    if (m.isLeader) continue
    const id = personId(m.user, myId)
    team.push(id)
    teamRoles[id] = m.roleName
  }
  return {
    id: d.id,
    authorId: personId(d.author, myId),
    createdAt: localDate(d.createdAt),
    title: d.title,
    description: d.description,
    leaderRole,
    desiredRoles,
    roleSkills: hasRoleSkills ? roleSkills : undefined,
    requiredSkills: d.requiredSkills.map((s) => s.name),
    preferredSkills: d.preferredSkills.map((s) => s.name),
    interests: d.interests.map((i) => i.name),
    startDate: d.startDate.slice(0, 10),
    endDate: d.endDate.slice(0, 10),
    roleCounts,
    recruitCount: Object.values(roleCounts).reduce((a, b) => a + b, 0),
    team,
    teamRoles,
    closed: d.status !== "OPEN", // 마감/완료
    openChat: d.openChatUrl,
    teamChat: d.teamChatUrl,
    canManage: d.canManage, // 작성자 또는 운영진
  }
}

// 화면 모집글 입력 → 서버 요청 (작성이면 authorRoleId 포함)
export async function toRecruitmentRequest(f, { create }) {
  const o = await loadOptions()
  const idOf = (list, name) => list.find((x) => x.name === name)?.id
  const roleNames = [...new Set([f.leaderRole, ...f.desiredRoles])]
  const body = {
    title: f.title,
    description: f.description,
    startDate: f.startDate,
    endDate: f.endDate,
    openChatUrl: f.openChat,
    teamChatUrl: f.teamChat || f.openChat, // 화면에 팀 채팅방 입력칸이 아직 없어 같은 링크를 씀
    roles: roleNames.map((n) => ({
      roleId: idOf(o.roles, n),
      capacity: (f.roleCounts[n] ?? 0) + (n === f.leaderRole ? 1 : 0), // 서버 정원은 팀장 포함
      // 역할별 필수·우대 기술
      requiredSkillIds: (f.roleSkills?.[n]?.required ?? []).map((s) => idOf(o.skills, s)).filter(Boolean),
      preferredSkillIds: (f.roleSkills?.[n]?.preferred ?? []).map((s) => idOf(o.skills, s)).filter(Boolean),
    })),
    requiredSkillIds: f.requiredSkills.map((n) => idOf(o.skills, n)).filter(Boolean),
    preferredSkillIds: f.preferredSkills.map((n) => idOf(o.skills, n)).filter(Boolean),
    interestIds: f.interests.map((n) => idOf(o.interests, n)).filter(Boolean),
  }
  if (create) body.authorRoleId = idOf(o.roles, f.leaderRole)
  return body
}

// 목록을 받아 각 글의 상세까지 불러옴 (목록 응답에는 설명/기술이 없어서). 시험용이라 최대 100건
export async function fetchPosts(myId) {
  const page = await api("/recruitments?size=100&sortBy=createdAt&sortDir=desc")
  const details = await Promise.all(page.items.map((it) => api(`/recruitments/${it.id}`)))
  return details.map((d) => postFromServer(d, myId))
}

export async function createPost(fields) {
  const d = await api("/recruitments", { method: "POST", body: await toRecruitmentRequest(fields, { create: true }) })
  return d.id
}

export async function updatePostOnServer(id, fields) {
  await api(`/recruitments/${id}`, { method: "PUT", body: await toRecruitmentRequest(fields, { create: false }) })
}

export const closePostOnServer = (id) => api(`/recruitments/${id}/close`, { method: "POST" })
export const deletePostOnServer = (id) => api(`/recruitments/${id}`, { method: "DELETE" })
