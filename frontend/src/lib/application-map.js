// ─────────────────────────────────────────────
// 지원·제안 / 부원 목록: 화면 형식 ↔ 서버 형식 변환 (시험 연동용)
// - 서버 상태 PENDING/ACCEPTED/REJECTED → 화면 pending/accepted/rejected (취소된 건은 목록에서 뺌)
// - 직접 거절(MANUAL)과 모집 마감으로 자동 정리(CLOSED)를 구분: CLOSED 는 autoClosed → 화면에 "모집 마감"
// - "매칭 화면을 봤는지"는 서버에 없어서 이 브라우저에만 기억해요
// ─────────────────────────────────────────────
import { api, localDate, fetchAllPages } from "./api"
import { loadOptions } from "./profile-map"
import { ME, members } from "../data"

const SEEN_KEY = "knot-seen-matches"

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"))
  } catch {
    return new Set()
  }
}
export function rememberSeen(id) {
  try {
    const set = loadSeen()
    set.add(id)
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set]))
  } catch {
    // 저장이 막혀 있으면 이번 화면에서만 기억
  }
}

// ── 부원 목록 (제안 대상/작성자 정보). 같은 배열을 유지해서 이미 import한 곳에도 반영돼요 ──
export async function loadMembers(myId) {
  const items = await fetchAllPages("/members") // 100명이 넘어도 끝까지
  const list = items
    .filter((m) => m.userId !== myId)
    .map((m) => ({
      id: m.userId, name: m.name, roles: m.roles.map((r) => r.name), completedGens: [],
      skills: m.skills.map((s) => s.name), interests: m.interests.map((i) => i.name),
      available: m.available, availableFrom: m.availableFrom ?? "", github: "", bio: m.bio ?? "", projects: [],
    }))
  members.splice(0, members.length, ...list)
}

const personId = (user, myId) => (user.id === myId ? ME : user.id)

function fromServer(a, myId, seen) {
  return {
    id: a.id,
    type: a.kind === "APPLY" ? "apply" : "propose",
    postId: a.recruitmentId,
    fromId: personId(a.sender, myId),
    toId: personId(a.receiver, myId),
    role: a.roleName,
    message: a.message ?? "",
    date: localDate(a.createdAt),
    status: a.status.toLowerCase(),
    autoClosed: a.status === "REJECTED" && a.rejectReason === "CLOSED",
    seenBy: seen.has(a.id) ? [ME] : [],
  }
}

// 내가 보낸 것 + 받은 것 + (작성자/운영진이 관리하는 글의) 전체 지원 목록을 합쳐서 받음
export async function fetchApplications(myId, posts) {
  const seen = loadSeen()
  const [sent, received, managed] = await Promise.all([
    fetchAllPages("/applications?box=sent"),
    fetchAllPages("/applications?box=received"),
    Promise.all(
      posts
        .filter((p) => p.authorId === ME)
        // 그사이 삭제된 글(404)은 지원 목록 없이 넘어가요
        .map((p) => fetchAllPages(`/recruitments/${p.id}/applications`).catch((e) => (e.status === 404 ? [] : Promise.reject(e)))),
    ),
  ])
  const byId = new Map()
  for (const a of [...sent, ...received, ...managed.flat()]) byId.set(a.id, a)
  return [...byId.values()]
    .filter((a) => a.status !== "CANCELED")
    .map((a) => fromServer(a, myId, seen))
}

async function roleIdOf(name) {
  const o = await loadOptions()
  return o.roles.find((r) => r.name === name)?.id
}

export async function applyToPost(postId, role, message) {
  await api(`/recruitments/${postId}/applications`, {
    method: "POST",
    body: { roleId: await roleIdOf(role), message: message?.trim() || null },
  })
}

export async function proposeToMember(postId, targetUserId, role, message) {
  await api(`/recruitments/${postId}/proposals`, {
    method: "POST",
    body: { roleId: await roleIdOf(role), targetUserId, message: message?.trim() || null },
  })
}

const post = (id, action) => api(`/applications/${id}/${action}`, { method: "POST" })
export const acceptApplication = (id) => post(id, "accept")
export const rejectApplication = (id) => post(id, "reject")
export const revertApplication = (id) => post(id, "revert")
export const cancelApplicationOnServer = (id) => post(id, "cancel")
