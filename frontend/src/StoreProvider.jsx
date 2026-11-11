// ─────────────────────────────────────────────
// 앱 전체 상태 (로그인, 내 정보, 모집글, 지원·제안, 알림, 설정)
// 지금은 브라우저(localStorage)에만 저장. 나중에 API 호출로 바꾸면 됨.
// ─────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { StoreContext } from "./lib/store-context"
import { ME, posts as seedPosts, applications as seedApps, notifications as seedNotis, archives as seedArchives } from "./data"
import { api, refreshSession, setAccessToken, GOOGLE_LOGIN_URL } from "./lib/api"
import {
  loadOptions, fetchMyProfile, saveMyProfile,
  createExperience, updateExperience, setExperienceVisibility, deleteExperience, importExperience,
} from "./lib/profile-map"
import { fetchArchives, createArchive, updateArchiveOnServer } from "./lib/archive-map"
import { getPerson } from "./lib/helpers"
import { fetchSettings, saveSettings, fetchNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, deleteAllNotifications } from "./lib/notification-map"
import { fetchPosts, createPost, updatePostOnServer, closePostOnServer, deletePostOnServer } from "./lib/post-map"
import {
  loadMembers, fetchApplications, rememberSeen, applyToPost, proposeToMember,
  acceptApplication, rejectApplication, revertApplication, cancelApplicationOnServer,
} from "./lib/application-map"

// 저장 형식이 바뀌면 숫자를 올려요 → 예전 저장 데이터는 무시하고 새로 시작
// v2: 역할별 인원에 팀장 포함 / v3: 역할별 필요 기술(roleSkills)
const STORAGE_KEY = "gdgoc-match-v3"

const emptyUser = {
  id: ME,
  name: "",
  roles: [],
  skills: [],
  interests: [],
  available: true,
  availableFrom: "",
  github: "",
  bio: "",
  completedGens: [], // 수료한 기수 (운영진이 지정, 예: ["6기"])
  activity: { sessions: 0, studies: 0, items: [] }, // 개인 활동 체크리스트 (lib/activity.js)
  projects: [],
}

const initialState = {
  loggedIn: false,
  codeVerified: false, // 가입 코드를 통과했는지 (통과해야 프로필 작성 가능)
  joined: false,
  user: emptyUser,
  posts: seedPosts,
  applications: seedApps,
  notifications: seedNotis,
  archives: seedArchives,
  // 알림 설정: 푸시 / 모집(새 모집글, 범위 선택) / 지원·제안 / 시스템(모집 완료, 팀 채팅방 열림, 운영진)
  settings: { push: true, notifyRecruit: true, notifyScope: "both", notifyApply: true, notifySystem: true },
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return initialState
    const data = JSON.parse(saved)
    const state = { ...initialState, ...data, settings: { ...initialState.settings, ...data.settings } }
    // 모집 마감 정리(대기 요청 자동 거절)는 서버가 처리하므로 여기서는 저장된 값을 그대로 씀
    return state
  } catch {
    return initialState
  }
}

function StoreProvider({ children }) {
  const [state, setState] = useState(loadState)
  const [authReady, setAuthReady] = useState(false) // 서버에 로그인 상태를 물어보기 전엔 화면을 그리지 않음
  const myIdRef = useRef(null) // 내 서버 사용자 id (모집글에서 "나"를 알아보는 데 씀)
  const stateRef = useRef(state) // 동작 안에서 최신 상태를 읽기 위한 참조
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // 앱을 켤 때 Refresh 쿠키로 로그인 상태 복원 (실패하면 로그아웃 상태)
  // nextStep: JOIN_CODE(가입 코드) → PROFILE(프로필) → HOME(홈)
  useEffect(() => {
    let alive = true
    refreshSession()
      .then(async (session) => {
        setAccessToken(session.accessToken)
        // 서버 선택 목록을 받아 두고, 가입을 마쳤으면 내 프로필도 불러와요
        myIdRef.current = session.user.id
        let profile = null
        let posts = null
        let applications = null
        let notifications = null
        let archives = null
        let settings = null
        if (session.nextStep !== "JOIN_CODE") {
          await loadOptions()
          if (session.nextStep === "HOME") {
            profile = await fetchMyProfile()
            await loadMembers(session.user.id) // 부원 목록(제안 대상, 작성자/팀원 정보)
            posts = await fetchPosts(session.user.id)
            applications = await fetchApplications(session.user.id, posts)
            notifications = await fetchNotifications().catch(() => []) // 알림을 못 받아도 화면은 열어요
            archives = await fetchArchives(session.user.id).catch(() => null) // 못 받으면 예시 그대로
            settings = await fetchSettings().catch(() => null) // 저장한 적 없거나 못 받으면 화면 기본값
          }
        }
        if (!alive) return
        setState((s) => ({
          ...s,
          loggedIn: true,
          joined: session.nextStep === "HOME",
          // 가입 코드는 이미 통과한 단계(PROFILE/HOME)면 true. 새로고침·최초 운영진도 프로필 화면에서 코드 화면으로 되돌려지지 않게
          codeVerified: session.nextStep !== "JOIN_CODE",
          nextStep: session.nextStep,
          user: { ...s.user, id: session.user.id, name: session.user.name || s.user.name, role: session.user.role, ...profile },
          // 서버 모집글·지원·알림으로 교체 (가짜 예시는 안 써요)
          ...(posts ? { posts, applications, notifications } : {}),
          ...(archives ? { archives } : {}),
          ...(settings ? { settings: { ...s.settings, ...settings } } : {}),
        }))
      })
      .catch(() => {
        if (!alive) return
        setAccessToken(null)
        setState((s) => ({ ...s, loggedIn: false, joined: false, nextStep: null }))
      })
      .finally(() => alive && setAuthReady(true))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // 저장 실패해도 앱은 계속 동작
    }
  }, [state])

  // 서버의 모집글 목록을 다시 받아 화면 상태에 넣음
  const reloadAll = useCallback(async () => {
    const posts = await fetchPosts(myIdRef.current)
    const applications = await fetchApplications(myIdRef.current, posts)
    const notifications = await fetchNotifications().catch(() => null)
    setState((s) => ({ ...s, posts, applications, ...(notifications ? { notifications } : {}) }))
  }, [])

  const actions = useMemo(
    () => ({
      // ── 회원 ──
      // 실제 Google 로그인: 서버로 이동 → Google → 서버 → 프론트로 돌아오면 위의 세션 복원이 실행돼요
      login: () => {
        window.location.href = GOOGLE_LOGIN_URL
      },
      logout: () => {
        api("/auth/logout", { method: "POST" }).catch(() => {}) // 실패해도 화면에선 로그아웃
        setAccessToken(null)
        setState((s) => ({ ...s, loggedIn: false, joined: false, nextStep: null }))
      },
      // 가입 코드 인증 (성공하면 새 토큰과 다음 단계를 받음)
      verifyJoinCode: async (code) => {
        const session = await api("/auth/join-code", { method: "POST", body: { code } })
        setAccessToken(session.accessToken)
        setState((s) => ({ ...s, codeVerified: true, nextStep: session.nextStep, joined: session.nextStep === "HOME" }))
        return session.nextStep
      },
      // 프로필 저장은 서버에 보내고, 성공하면 화면에 반영 (실패하면 오류를 던져 화면이 안내)
      completeProfile: async (profile) => {
        const saved = await saveMyProfile(profile)
        await loadMembers(myIdRef.current)
        const posts = await fetchPosts(myIdRef.current)
        const applications = await fetchApplications(myIdRef.current, posts)
        const notifications = await fetchNotifications().catch(() => [])
        const archives = await fetchArchives(myIdRef.current).catch(() => null)
        const settings = await fetchSettings().catch(() => null)
        setState((s) => ({
          ...s, joined: true, nextStep: "HOME", user: { ...s.user, ...saved },
          posts, applications, notifications, ...(archives ? { archives } : {}),
          ...(settings ? { settings: { ...s.settings, ...settings } } : {}),
        }))
      },
      saveProfile: async (profile) => {
        const saved = await saveMyProfile(profile)
        setState((s) => ({ ...s, user: { ...s.user, ...saved } }))
      },
      updateUser: (partial) => setState((s) => ({ ...s, user: { ...s.user, ...partial } })),
      // 회원 탈퇴: 서버 계정을 지운 뒤 화면도 처음 상태로 (실패하면 안내)
      withdraw: async () => {
        try {
          await api("/users/me", { method: "DELETE" })
        } catch (e) {
          window.alert(e.message)
          return false
        }
        setAccessToken(null)
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          // 무시
        }
        setState(initialState)
        return true
      },

      // ── 프로젝트 경험 (서버에 저장) ──
      // 서버에 요청한 뒤 돌려받은 값으로 화면을 바꿔요 (실패하면 오류를 던져 화면이 안내)
      addProject: async (project) => {
        const saved = await createExperience(project)
        setState((s) => ({ ...s, user: { ...s.user, projects: [...s.user.projects, saved] } }))
      },
      updateProject: async (id, fields) => {
        const saved = await updateExperience(id, fields)
        setState((s) => ({ ...s, user: { ...s.user, projects: s.user.projects.map((p) => (p.id === id ? saved : p)) } }))
      },
      setProjectPublic: async (id, isPublic) => {
        const saved = await setExperienceVisibility(id, isPublic)
        setState((s) => ({ ...s, user: { ...s.user, projects: s.user.projects.map((p) => (p.id === id ? saved : p)) } }))
      },
      // 아카이브에서 가져오기 (실패하면 서버 안내 문구를 그대로 던져요)
      importProject: async (archiveId) => {
        const saved = await importExperience(archiveId)
        setState((s) => ({ ...s, user: { ...s.user, projects: [...s.user.projects, saved] } }))
      },
      removeProject: async (id) => {
        await deleteExperience(id)
        setState((s) => ({ ...s, user: { ...s.user, projects: s.user.projects.filter((p) => p.id !== id) } }))
      },

      // ── 모집글 ──
      // 서버에 요청한 뒤 목록을 다시 받아 화면에 반영해요 (실패하면 오류를 던져 화면이 안내)
      addPost: async (fields) => {
        const id = await createPost(fields)
        await reloadAll()
        return id
      },
      updatePost: async (id, fields) => {
        await updatePostOnServer(id, fields)
        await reloadAll()
      },
      // 마감/삭제는 호출하는 쪽이 따로 오류 처리를 하지 않아서 여기서 안내까지 해요
      closePost: async (id) => {
        try {
          await closePostOnServer(id)
          await reloadAll()
        } catch (e) {
          window.alert(e.message)
        }
      },
      deletePost: async (id) => {
        try {
          await deletePostOnServer(id)
          await reloadAll()
        } catch (e) {
          window.alert(e.message)
        }
      },

      // ── 지원·제안 ──
      // 서버에 요청한 뒤 모집글·지원 목록을 다시 받아 화면에 반영해요 (오류는 여기서 안내)
      apply: async (post, role, message) => {
        try {
          await applyToPost(post.id, role, message)
          await reloadAll()
        } catch (e) {
          window.alert(e.message)
        }
      },
      propose: async (postId, toId, role, message) => {
        try {
          await proposeToMember(postId, toId, role, message)
          await reloadAll()
        } catch (e) {
          window.alert(e.message)
        }
      },
      cancelApplication: async (id) => {
        try {
          await cancelApplicationOnServer(id)
          await reloadAll()
        } catch (e) {
          window.alert(e.message)
        }
      },
      // 수락/거절. 이미 응답한 건을 바꾸려면 먼저 "대기"로 되돌린 뒤 처리해요
      // (수락을 취소하면 거절이 아니라 다시 대기로 돌아가요)
      // 끝나면 성공 여부(true/false)를 돌려줘요 → 수락 성공 후에만 매칭 화면으로 가요
      respond: async (id, accept) => {
        const app = stateRef.current.applications.find((a) => a.id === id)
        if (!app) return false
        let ok = true
        try {
          if (accept) {
            if (app.status !== "pending") await revertApplication(id)
            await acceptApplication(id)
            rememberSeen(id) // 수락한 나는 매칭 화면을 바로 보니까 "봤음"
          } else if (app.status === "accepted") {
            await revertApplication(id)
          } else {
            await rejectApplication(id)
          }
        } catch (e) {
          ok = false
          window.alert(e.message)
        }
        await reloadAll().catch(() => {}) // 서버 상태(수락됨)를 다시 받은 뒤에 끝나요
        return ok
      },

      // 응답 되돌리기: 수락 취소·거절 취소 모두 다시 "응답 안 한 상태(대기)"로
      undoResponse: async (id) => {
        try {
          await revertApplication(id)
        } catch (e) {
          window.alert(e.message)
        }
        await reloadAll().catch(() => {})
      },

      // 매칭 화면을 봤다고 표시 (다시 자동으로 뜨지 않게)
      markMatchSeen: (id) => {
        rememberSeen(id)
        setState((s) => ({
          ...s,
          applications: s.applications.map((a) =>
            a.id === id ? { ...a, seenBy: [...new Set([...(a.seenBy ?? []), ME])] } : a
          ),
        }))
      },

      // 팀장이 확정 팀원 내보내기 (모집이 끝난 뒤)
      // 서버에서 그 역할 자리가 다시 비고 모집이 다시 열려요. 그 사람의 지원·제안은 "removed"(팀에서 빠짐)로 남아요
      removeMember: async (postId, memberId) => {
        try {
          await api(`/recruitments/${postId}/members/${memberId}`, { method: "DELETE" })
        } catch (e) {
          window.alert(e.message)
        }
        await reloadAll().catch(() => {})
      },

      // ── 프로젝트 아카이브 (REQ-030) ──
      // 서버에 저장하고, 돌려받은 값으로 화면을 바꿔요 (실패하면 오류를 던져 화면이 안내)
      // 참여 부원 이름도 같이 저장해서, 나중에 탈퇴해도 아카이브엔 이름이 남아요
      addArchive: async (fields) => {
        const nameOf = (id) => getPerson(stateRef.current.user, id)?.name
        const saved = await createArchive(fields, myIdRef.current, nameOf)
        setState((s) => ({ ...s, archives: [saved, ...s.archives] }))
        return saved.id
      },
      updateArchive: async (id, fields) => {
        const nameOf = (mid) => getPerson(stateRef.current.user, mid)?.name
        const saved = await updateArchiveOnServer(id, fields, myIdRef.current, nameOf)
        setState((s) => ({ ...s, archives: s.archives.map((a) => (a.id === id ? saved : a)) }))
      },

      // ── 알림 (서버) · 설정 ──
      // 화면을 먼저 바꾸고 서버에 알려요 (실패하면 서버 목록으로 다시 맞춰요)
      markAllRead: () => {
        setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
        markAllNotificationsRead().catch(() => reloadAll().catch(() => {}))
      },
      markRead: (id) => {
        setState((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
        markNotificationRead(id).catch(() => reloadAll().catch(() => {}))
      },
      removeNotification: (id) => {
        setState((s) => ({ ...s, notifications: s.notifications.filter((n) => n.id !== id) }))
        deleteNotification(id).catch(() => reloadAll().catch(() => {}))
      },
      clearNotifications: () => {
        setState((s) => ({ ...s, notifications: [] }))
        deleteAllNotifications().catch(() => reloadAll().catch(() => {}))
      },
      // 알림 설정: 화면을 먼저 바꾸고 서버에 저장 (실패하면 안내하고 서버 값으로 되돌려요)
      updateSettings: (partial) => {
        setState((s) => ({ ...s, settings: { ...s.settings, ...partial } }))
        saveSettings(partial).catch(async (e) => {
          window.alert(e.message)
          const fresh = await fetchSettings().catch(() => null)
          if (fresh) setState((s) => ({ ...s, settings: { ...s.settings, ...fresh } }))
        })
      },
    }),
    [reloadAll]
  )

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions])

  if (!authReady) return null

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export default StoreProvider
