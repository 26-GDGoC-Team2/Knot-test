import { useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import Background from "../components/Background"
import { TopBar, PrimaryButton } from "../components/ui"
import Icon from "../components/Icon"
import { useStore } from "../lib/store-context"

function StepDots({ step }) {
  return (
    <div className="flex gap-1.5" aria-label={`가입 2단계 중 ${step}단계`}>
      {[1, 2].map((s) => (
        <span key={s} className={`h-1.5 rounded-full ${s === step ? "w-6 bg-ink" : "w-1.5 bg-gray-300"}`}></span>
      ))}
    </div>
  )
}

// 가입 코드 인증 (REQ-002)
function JoinCodePage() {
  const navigate = useNavigate()
  const [code, setCode] = useState("")
  const [result, setResult] = useState(null) // null | "ok" | "wrong"
  const { loggedIn, joined, nextStep, codeVerified, logout, verifyJoinCode } = useStore()

  // 서버에서 코드 확인 (틀리면 400, 서버 연결 실패면 "error")
  async function verify() {
    try {
      await verifyJoinCode(code.trim())
      setResult("ok")
    } catch (e) {
      setResult(e.status === 400 ? "wrong" : "error")
    }
  }

  // 로그인 전이면 시작 화면으로, 이미 가입했으면 홈으로
  if (!loggedIn) return <Navigate to="/start" replace />
  if (joined) return <Navigate to="/" replace />
  // 코드는 이미 인증했고 프로필만 남았으면 프로필 화면으로 (인증 직후에는 버튼으로 이동)
  if (nextStep === "PROFILE" && result !== "ok") return <Navigate to="/join/profile" replace />

  return (
    <Background bottomSpace={false}>
      <TopBar
        title=""
        right={<StepDots step={1} />}
        // 뒤로: 시작 화면은 로그인 상태면 다시 여기로 보내기 때문에, 로그아웃하고 시작 화면으로 가요
        onBack={() => {
          logout()
          navigate("/start", { replace: true })
        }}
      />

      <div className="flex flex-col gap-3 pt-8">
        <span className="w-14 h-14 rounded-[20px] bg-ink text-white flex items-center justify-center">
          <Icon name="lock" size={26} />
        </span>
        <h1 className="text-3xl font-semibold leading-snug mt-3">가입 코드를<br />입력해 주세요</h1>
        <p className="text-sm text-sub">동아리 공지로 받은 코드예요. 가입할 때 한 번만 확인해요.</p>
      </div>

      <div className="glass rounded-[28px] p-5 mt-8 flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\s/g, "")) // 띄어쓰기는 입력되지 않게 (붙여넣기 해도 빠져요)
              setResult(null)
            }}
            onKeyDown={(e) => e.key === "Enter" && code && verify()}
            placeholder="가입 코드"
            aria-label="가입 코드"
            // 휴대폰 키보드가 자동 수정·띄어쓰기를 넣지 않게
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 h-14 rounded-2xl bg-white border border-line px-4 text-lg font-semibold tracking-[0.12em] uppercase outline-none focus:border-ink placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-[#9AA0A6]"
          />
          <button onClick={verify} disabled={!code} className="h-14 px-5 rounded-2xl bg-ink text-white font-medium disabled:bg-gray-300">
            확인
          </button>
        </div>
        {result === "ok" && (
          <p className="text-sm font-medium text-green-700 flex items-center gap-1.5">
            <Icon name="check" size={16} strokeWidth={2.6} /> 인증되었습니다
          </p>
        )}
        {result === "wrong" && <p className="text-sm font-medium text-red-600">가입 코드가 맞지 않아요</p>}
        {result === "error" && <p className="text-sm font-medium text-red-600">서버에 연결하지 못했어요. 잠시 후 다시 해 주세요</p>}
      </div>

      <div className="fixed left-0 right-0 bottom-0 p-5">
        <div className="max-w-md mx-auto flex flex-col items-center gap-3">
          <PrimaryButton disabled={result !== "ok" && !codeVerified} onClick={() => navigate("/join/profile")} className="w-full">{/* 이미 통과했으면(프로필 화면에서 뒤로 온 경우) 다시 안 쳐도 돼요 */}
            프로필 만들러 가기
          </PrimaryButton>
          <span className="text-xs text-sub">코드를 모르겠다면 운영진에게 문의해 주세요</span>
        </div>
      </div>
    </Background>
  )
}

export default JoinCodePage
