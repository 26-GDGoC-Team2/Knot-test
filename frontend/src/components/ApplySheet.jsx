import { useState } from "react"
import Sheet from "./Sheet"
import ConfirmDialog from "./ConfirmDialog"
import { PrimaryButton, SecondaryButton } from "./ui"
import Icon from "./Icon"
import { MESSAGE_MAX } from "../data"
import { useStore } from "../lib/store-context"
import { roleDot, roleOpen, roleLeft, withRo } from "../lib/helpers"

// 지원하기 바텀시트 (REQ-019) — AI 모집글 추천에서 바로 지원할 때 사용
// 모집글 상세의 '역할 골라 바로 지원'과 같은 규칙: 자리가 남은 역할만, 한 줄 메시지는 선택, 보내기 전에 한 번 더 확인
function ApplySheet({ post, onClose }) {
  const { user, apply } = useStore()
  const [role, setRole] = useState(post.desiredRoles.find((r) => user.roles.includes(r) && roleOpen(post, r)) ?? null)
  const [message, setMessage] = useState("")
  const [asking, setAsking] = useState(false) // 확인 창
  const [sent, setSent] = useState(false)

  return (
    <Sheet label="지원하기" onClose={onClose}>
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="w-16 h-16 rounded-full bg-ink text-white flex items-center justify-center">
            <Icon name="check" size={28} strokeWidth={2.4} />
          </span>
          <h2 className="text-xl font-medium mt-2">지원을 보냈어요</h2>
          <p className="text-sm text-sub">팀장이 응답하면 알림으로 알려드릴게요.</p>
          <SecondaryButton onClick={onClose} className="mt-3 w-full">확인</SecondaryButton>
        </div>
      ) : (
        <>
          <div>
            <p className="text-sm text-sub">{post.title}</p>
            <h2 className="text-2xl font-normal mt-1">어떤 역할로 지원할까요?</h2>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {post.desiredRoles.map((r) => {
              const left = roleLeft(post, r)
              const full = !roleOpen(post, r)
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  disabled={full}
                  aria-pressed={role === r}
                  className={`h-16 rounded-[22px] border px-4 flex items-center gap-2 font-medium disabled:bg-[#F1F3F4] disabled:text-[#9AA0A6] disabled:border-transparent ${
                    role === r ? "bg-ink text-white border-ink" : "bg-white border-line"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${full ? "bg-gray-300" : roleDot[r] ?? "bg-gray-400"}`}></span>
                  <span className="flex-1 text-left">{r}</span>
                  <span className={`text-[11px] font-normal ${role === r ? "text-white/70" : "text-sub"}`}>
                    {full ? "마감" : `${left}자리 남음`}
                  </span>
                </button>
              )
            })}
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              한 줄 메시지 <span className="text-xs text-sub font-normal">선택</span>
            </span>
            <span className="h-13 rounded-full bg-white border border-line flex items-center px-5 gap-2 focus-within:border-ink">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                placeholder="나를 짧게 소개해 주세요"
                className="flex-1 h-12 outline-none bg-transparent text-sm"
              />
              <span className="text-xs text-sub">{message.length}/{MESSAGE_MAX}</span>
            </span>
          </label>

          <PrimaryButton disabled={!role} onClick={() => setAsking(true)}>
            {role ? `${withRo(role)} 지원하기` : "역할을 골라 주세요"}
          </PrimaryButton>
        </>
      )}
      {asking && (
        <ConfirmDialog
          title={`'${post.title}'에 ${withRo(role)} 지원하시겠습니까?`}
          desc="응답을 받기 전까지는 지원을 취소할 수 있어요."
          confirmLabel="지원하기"
          onClose={() => setAsking(false)}
          onConfirm={() => {
            apply(post, role, message.trim())
            setAsking(false)
            setSent(true)
          }}
        />
      )}
    </Sheet>
  )
}

export default ApplySheet
