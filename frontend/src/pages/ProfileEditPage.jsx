import { useNavigate } from "react-router-dom"
import Background from "../components/Background"
import { TopBar } from "../components/ui"
import ProfileForm from "../components/ProfileForm"
import { useStore } from "../lib/store-context"

// 프로필 수정 (REQ-005)
function ProfileEditPage() {
  const navigate = useNavigate()
  const { user, saveProfile } = useStore()

  return (
    <Background bottomSpace={false}>
      <TopBar title="프로필 수정" />
      <ProfileForm
        initial={user}
        submitLabel="저장"
        onSubmit={async (profile) => {
          try {
            await saveProfile(profile)
            navigate(-1)
          } catch (e) {
            window.alert(e.message) // 서버 검증 메시지 그대로 안내
          }
        }}
      />
    </Background>
  )
}

export default ProfileEditPage
