import { useEffect, useState } from "react"
import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { useStore } from "./lib/store-context"
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

// 로그인 + 가입을 마친 사람만 들어갈 수 있는 화면
function RequireJoined({ children }) {
  const { loggedIn, joined } = useStore()
  if (!loggedIn) return <Navigate to="/start" replace />
  if (!joined) return <Navigate to="/join/code" replace />
  return children
}

// 안드로이드: 홈에서 뒤로가기를 두 번 누르면 앱이 닫혀요 (회의 결정)
// - 홈에 '한 칸 더' 기록을 쌓아 두고, 첫 뒤로가기는 그 칸만 지우며 안내를 띄워요
// - 2초 안에 한 번 더 누르면 더 돌아갈 곳이 없어서 앱이 닫혀요 (설치한 앱 기준. 크롬 탭이면 이전 사이트/탭 닫힘)
// - 2초가 지나면 다시 한 칸을 쌓아요
const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)

function BackToExit() {
  const { pathname, state } = useLocation()
  const atHome = pathname === "/" && !state?.background
  const [toast, setToast] = useState(false)

  useEffect(() => {
    if (!isAndroid || !atHome) return
    const guard = () => {
      if (!window.history.state?.knotGuard) window.history.pushState({ ...window.history.state, knotGuard: true }, "")
    }
    guard()
    let timer = null
    const onPop = () => {
      if (window.location.pathname !== "/" || window.history.state?.knotGuard) return
      setToast(true)
      clearTimeout(timer)
      timer = setTimeout(() => {
        setToast(false)
        if (window.location.pathname === "/") guard() // 2초 동안 안 누르면 다시 처음 상태로
      }, 2000)
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      clearTimeout(timer)
    }
  }, [atHome])

  if (!toast) return null
  return (
    <div className="fixed left-0 right-0 bottom-28 z-[80] flex justify-center pointer-events-none fade-in">
      <span className="px-4 py-2.5 rounded-full bg-ink/90 text-white text-sm">한 번 더 누르면 종료돼요</span>
    </div>
  )
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
      <BackToExit />
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
