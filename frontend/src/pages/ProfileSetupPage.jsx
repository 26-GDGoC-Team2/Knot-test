import { useEffect } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import Background from "../components/Background"
import { TopBar } from "../components/ui"
import ProfileForm from "../components/ProfileForm"
import { useStore } from "../lib/store-context"

// 프로필 최초 작성 (REQ-004)
function ProfileSetupPage() {
  const navigate = useNavigate()
  const { user, loggedIn, codeVerified, joined, completeProfile } = useStore()

  // 가입이 저장된 다음에 홈으로 (이미 가입한 사람이 오면 바로 홈)
  useEffect(() => {
    if (joined) navigate("/", { replace: true })
  }, [joined, navigate])

  // 주소를 직접 쳐서 들어와도: 로그인 전이면 시작 화면, 가입 코드를 안 거쳤으면 가입 코드 화면으로
  if (!loggedIn) return <Navigate to="/start" replace />
  if (!joined && !codeVerified) return <Navigate to="/join/code" replace />

  return (
    <Background bottomSpace={false}>
      <TopBar
        right={
          <div className="flex gap-1.5" aria-label="가입 2단계 중 2단계">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
            <span className="w-6 h-1.5 rounded-full bg-ink"></span>
          </div>
        }
      />
      <h1 className="text-3xl font-semibold leading-snug mb-2">프로필을<br />만들어 주세요</h1>
      <p className="text-sm text-sub mb-8">AI가 이 정보로 잘 맞는 팀과 팀원을 추천해요.</p>

      <ProfileForm
        initial={user}
        submitLabel="가입 완료"
        onSubmit={async (profile) => {
          try {
            await completeProfile(profile)
          } catch (e) {
            window.alert(e.message) // 서버 검증 메시지 그대로 안내
          }
        }}
      />
    </Background>
  )
}

export default ProfileSetupPage
