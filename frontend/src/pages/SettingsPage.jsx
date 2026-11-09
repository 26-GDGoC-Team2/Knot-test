import { useState } from "react"
import { useNavigate } from "react-router-dom"
import Background from "../components/Background"
import Sheet from "../components/Sheet"
import ConfirmDialog from "../components/ConfirmDialog"
import { TopBar, Toggle, PrimaryButton, SecondaryButton, SectionTitle } from "../components/ui"
import { useStore } from "../lib/store-context"

const scopes = [
  { value: "both", label: "관심 분야 + 희망 역할 모두 일치", desc: "기본값 · 알림이 가장 적어요" },
  { value: "interest", label: "관심 분야만 일치" },
  { value: "role", label: "희망 역할만 일치" },
]

// 받을 알림 종류 (백엔드와 정한 구분)
const kinds = [
  { key: "notifyRecruit", label: "모집 알림", desc: "새 모집글 등록" },
  { key: "notifyApply", label: "지원 · 제안 알림", desc: "받은 지원·제안, 수락·거절, 수락·거절 취소" },
  { key: "notifySystem", label: "시스템 알림", desc: "모집 완료, 팀 채팅방 열림, 운영진 안내" },
]

// 설정 (REQ-021, REQ-024)
function SettingsPage() {
  const navigate = useNavigate()
  const { settings, updateSettings, logout, withdraw } = useStore()
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const [askLogout, setAskLogout] = useState(false)

  return (
    <Background bottomSpace={false}>
      <TopBar title="설정" />

      <SectionTitle>알림</SectionTitle>
      <div className="glass rounded-[26px] p-4 flex items-center justify-between">
        <span className="text-sm font-medium">푸시 알림</span>
        <Toggle checked={settings.push} onChange={(v) => updateSettings({ push: v })} label="푸시 알림" />
      </div>
      <p className="text-xs text-sub mt-2 leading-relaxed">
        아이폰은 Safari에서 공유 버튼 → <b className="font-medium text-ink">홈 화면에 추가</b>한 뒤, 홈 화면의 knot으로 열어야 알림을 받을 수 있어요.
      </p>

      {/* 받을 알림: 모집 / 지원·제안 / 시스템 (백엔드 알림 설정과 같은 구분) */}
      <p className="text-sm font-medium mt-5 mb-2">받을 알림</p>
      <div className="glass rounded-[26px] px-4 flex flex-col">
        {kinds.map((k) => (
          <div key={k.key} className="py-3.5 flex items-center gap-3 border-t border-line first:border-t-0">
            <span className="flex-1 min-w-0">
              <span className="text-sm font-medium block">{k.label}</span>
              <span className="text-xs text-sub">{k.desc}</span>
            </span>
            <Toggle checked={settings[k.key]} onChange={(v) => updateSettings({ [k.key]: v })} label={k.label} />
          </div>
        ))}
      </div>
      {!settings.notifyApply && (
        <p className="text-xs text-red-600 mt-2">지원이나 제안이 와도 알림이 오지 않아요. 내역에서 직접 확인해 주세요.</p>
      )}
      {!settings.notifySystem && (
        <p className="text-xs text-sub mt-2">팀 채팅방은 알림이 없어도 모집글 상세에서 들어갈 수 있어요.</p>
      )}

      {/* 모집 알림이 켜져 있을 때만 범위 선택 */}
      {settings.notifyRecruit && (
        <>
          <p className="text-sm font-medium mt-5 mb-2">모집 알림 범위</p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="모집 알림 범위">
            {scopes.map((s) => {
              const active = settings.notifyScope === s.value
              return (
                <button
                  key={s.value}
                  role="radio"
                  aria-checked={active}
                  onClick={() => updateSettings({ notifyScope: s.value })}
                  className={`rounded-[22px] p-4 text-left flex items-center gap-3 border ${active ? "bg-ink text-white border-ink" : "glass"}`}
                >
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? "border-white" : "border-gray-400"}`}>
                    {active && <span className="w-2.5 h-2.5 rounded-full bg-white"></span>}
                  </span>
                  <span className="flex-1">
                    <span className="text-sm font-medium block">{s.label}</span>
                    {s.desc && <span className={`text-xs ${active ? "text-gray-300" : "text-sub"}`}>{s.desc}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <SectionTitle>계정</SectionTitle>
      <div className="flex flex-col gap-2">
        <SecondaryButton onClick={() => setAskLogout(true)}>
          로그아웃
        </SecondaryButton>
        <button onClick={() => setConfirmWithdraw(true)} className="h-12 text-sm text-sub underline underline-offset-2">
          회원 탈퇴
        </button>
      </div>

      {confirmWithdraw && (
        <Sheet label="회원 탈퇴" onClose={() => setConfirmWithdraw(false)}>
          <h2 className="text-xl font-medium">정말 탈퇴할까요?</h2>
          <ul className="text-sm text-sub list-disc pl-5 flex flex-col gap-1">
            <li>프로필, 프로젝트 경험 같은 개인 정보는 삭제돼요.</li>
            <li>내 모집글은 모집 완료로 바뀌어요.</li>
            <li>대기 중인 지원·제안은 자동으로 취소돼요.</li>
            <li>모집글 · 확정 팀원 목록에는 '탈퇴한 회원'으로 표시돼요.</li>
          </ul>
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setConfirmWithdraw(false)} className="flex-1">취소</SecondaryButton>
            <PrimaryButton
              onClick={() => {
                withdraw()
                navigate("/start", { replace: true })
              }}
              className="flex-1 bg-red-600!"
            >
              탈퇴
            </PrimaryButton>
          </div>
        </Sheet>
      )}
      {askLogout && (
        <ConfirmDialog
          title="로그아웃하시겠습니까?"
          confirmLabel="로그아웃"
          onClose={() => setAskLogout(false)}
          onConfirm={() => {
            logout()
            navigate("/start", { replace: true })
          }}
        />
      )}
    </Background>
  )
}

export default SettingsPage
