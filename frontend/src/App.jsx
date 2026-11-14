import { useEffect, useRef, useState } from "react"
import { Routes, Route, Navigate, useLocation, useNavigate, useNavigationType } from "react-router-dom"
import { useStore } from "./lib/store-context"
import { isAndroid } from "./lib/back-exit"
import StartPage from "./pages/StartPage"
import JoinCodePage from "./pages/JoinCodePage"
import ProfileSetupPage from "./pages/ProfileSetupPage"
import HomePage from "./pages/HomePage"
import PostDetailPage from "./pages/PostDetailPage"
import PostWritePage from "./pages/PostWritePage"
import MemberProfilePage from "./pages/MemberProfilePage"
import MyPostsPage from "./pages/MyPostsPage"
import ActivityPage from "./pages/ActivityPage"
import NotificationsPage from "./pages/NotificationsPage"
import MyPage from "./pages/MyPage"
import ProfileEditPage from "./pages/ProfileEditPage"
import ProjectsPage from "./pages/ProjectsPage"
import SettingsPage from "./pages/SettingsPage"
import ArchivePage from "./pages/ArchivePage"
import ArchiveDetailPage from "./pages/ArchiveDetailPage"
import ArchiveFormPage from "./pages/ArchiveFormPage"
import ContestsPage from "./pages/ContestsPage"
import AIRecommendPage from "./pages/AIRecommendPage"
import MatchPage from "./pages/MatchPage"
import SplashScreen from "./components/SplashScreen"
import ActivityChecklistPage from "./pages/ActivityChecklistPage"
import AdminPage from "./pages/AdminPage"
import ProjectDetailPage from "./pages/ProjectDetailPage"

// 로그인 + 가입을 마친 사람만 들어갈 수 있는 화면
function RequireJoined({ children }) {
  const { loggedIn, joined } = useStore()
  if (!loggedIn) return <Navigate to="/start" replace />
  if (!joined) return <Navigate to="/join/code" replace />
  return children
}

// 안드로이드 뒤로가기 (회의 결정)
// - 홈: 어디서 왔든 2초 안에 두 번 누르면 앱 종료 (안내 문구 없음)
// - 다른 탭의 첫 화면(아카이브·공모전·내역·마이): 뒤로가기 → 홈
// - 그 안의 화면들: 이전 화면으로 (기본 동작)
// 방법: 기록마다 몇 번째 칸인지(kd)를 적어 두고, 홈으로 갈 때는 맨 처음 칸까지 되감아서 홈을 맨 앞에 둬요
//      홈·탭 첫 화면에는 '한 칸 더'(guard)를 쌓아서 뒤로가기를 가로채요
const TAB_ROOTS = ["/archive", "/contests", "/activity", "/me"]
const kdNow = () => window.history.state?.kd ?? 0

function AndroidBack() {
  const { pathname, state } = useLocation()
  const navType = useNavigationType()
  const navigate = useNavigate()
  const kdRef = useRef(0)
  const rewinding = useRef(false)
  const overlay = Boolean(state?.background)
  const atHome = pathname === "/" && !overlay
  const atTabRoot = TAB_ROOTS.includes(pathname) && !overlay

  // 홈을 맨 처음 칸으로: 쌓인 기록을 모두 되감고 그 자리를 홈으로 바꿔요
  const goHomeFirst = () => {
    const kd = kdNow()
    if (kd > 0) {
      rewinding.current = true
      window.history.go(-kd)
    } else navigate("/", { replace: true })
  }

  // 뒤로가기(popstate)마다 지금 칸 번호를 바로 읽어 둬요 (다음에 쌓는 칸 번호가 어긋나지 않게)
  useEffect(() => {
    if (!isAndroid) return
    const sync = () => { kdRef.current = kdNow() }
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [])

  // 기록 칸 번호 적기
  useEffect(() => {
    if (!isAndroid) return
    if (rewinding.current) {
      // 되감기가 끝나 맨 처음 칸에 왔어요 → 홈으로 바꿔요
      rewinding.current = false
      kdRef.current = 0
      navigate("/", { replace: true })
      return
    }
    let kd = kdRef.current
    if (navType === "PUSH") kd = kdRef.current + 1
    else if (navType === "POP") kd = kdNow()
    kdRef.current = kd
    if (window.history.state?.kd !== kd) window.history.replaceState({ ...window.history.state, kd }, "")
  }, [pathname, state, navType]) // eslint-disable-line react-hooks/exhaustive-deps

  // 홈·탭 첫 화면: 뒤로가기 가로채기
  useEffect(() => {
    if (!isAndroid || (!atHome && !atTabRoot)) return
    if (atHome && kdNow() > 0) {
      goHomeFirst() // 다른 화면을 거쳐 홈에 왔으면 홈을 맨 앞으로
      return
    }
    const guard = () => {
      if (window.history.state?.knotGuard) return
      const kd = kdNow() + 1
      window.history.pushState({ ...window.history.state, kd, knotGuard: true }, "")
      kdRef.current = kd // 다음 화면은 이 칸 다음 번호
    }
    guard()
    let timer = null
    const onPop = () => {
      if (window.history.state?.knotGuard || window.location.pathname !== pathname) return
      if (atTabRoot) {
        goHomeFirst() // 탭 첫 화면 → 홈
        return
      }
      // 홈 첫 번째 뒤로가기: 한 칸만 지워요. 2초 안에 한 번 더 누르면 돌아갈 곳이 없어 앱이 닫혀요
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (window.location.pathname === "/") guard() // 2초 동안 안 누르면 다시 처음 상태로
      }, 2000)
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      clearTimeout(timer)
    }
  }, [atHome, atTabRoot, pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// 화면이 바뀌면 맨 위로 스크롤 (상세 시트가 위에 뜰 때는 뒤 화면 위치 그대로)
function ScrollToTop() {
  const { pathname, state } = useLocation()
  const overSheet = Boolean(state?.background)
  useEffect(() => {
    if (!overSheet) window.scrollTo(0, 0)
  }, [pathname, overSheet])
  return null
}

const protectedRoutes = [
  { path: "/", element: <HomePage /> },
  { path: "/posts/new", element: <PostWritePage /> },
  { path: "/posts/:id", element: <PostDetailPage /> },
  { path: "/posts/:id/edit", element: <PostWritePage /> },
  { path: "/members/:id", element: <MemberProfilePage /> },
  { path: "/my-posts", element: <MyPostsPage /> },
  { path: "/activity", element: <ActivityPage /> },
  { path: "/notifications", element: <NotificationsPage /> },
  { path: "/me", element: <MyPage /> },
  { path: "/me/edit", element: <ProfileEditPage /> },
  { path: "/me/projects", element: <ProjectsPage /> },
  { path: "/me/projects/:id", element: <ProjectDetailPage /> },
  { path: "/me/activity", element: <ActivityChecklistPage /> },
  { path: "/settings", element: <SettingsPage /> },
  { path: "/admin", element: <AdminPage /> },
  { path: "/archive", element: <ArchivePage /> },
  { path: "/archive/new", element: <ArchiveFormPage /> },
  { path: "/archive/:id", element: <ArchiveDetailPage /> },
  { path: "/archive/:id/edit", element: <ArchiveFormPage /> },
  { path: "/contests", element: <ContestsPage /> },
  { path: "/ai", element: <AIRecommendPage /> },
  { path: "/match/:id", element: <MatchPage /> },
]

function App() {
  // 목록에서 모집글을 누르면 state.background에 "뒤에 깔릴 화면"이 담겨 와요.
  // 그럼 뒤 화면은 그대로 그리고, 그 위에 상세 시트만 띄워요.
  const location = useLocation()
  const background = location.state?.background

  // 앱을 켤 때 로딩 화면: 로고(1.2초)와 knot 글자가 다 나오면 살짝 사라지고 원래 화면으로
  const [splash, setSplash] = useState(() => {
    try {
      return sessionStorage.getItem("knot-splash") ? "done" : "show" // 이번에 켠 동안 이미 봤으면 생략
    } catch {
      return "show"
    }
  }) // show → leaving → done
  useEffect(() => {
    if (splash === "done") return
    try {
      sessionStorage.setItem("knot-splash", "1")
    } catch {
      // 저장이 막혀 있으면 그냥 매번 보여 줘요
    }
    const t1 = setTimeout(() => setSplash("leaving"), 1900)
    const t2 = setTimeout(() => setSplash("done"), 2120)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {splash !== "done" && <SplashScreen leaving={splash === "leaving"} />}
      <ScrollToTop />
      <AndroidBack />
      <Routes location={background || location}>
        <Route path="/start" element={<StartPage />} />
        <Route path="/join/code" element={<JoinCodePage />} />
        <Route path="/join/profile" element={<ProfileSetupPage />} />
        {protectedRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={<RequireJoined>{r.element}</RequireJoined>} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {background && (
        <Routes>
          <Route path="/posts/:id" element={<RequireJoined><PostDetailPage overlay /></RequireJoined>} />
        </Routes>
      )}
    </>
  )
}

export default App
