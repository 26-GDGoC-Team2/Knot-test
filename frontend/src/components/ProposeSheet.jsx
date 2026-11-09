import { useState } from "react"
import { Link } from "react-router-dom"
import Sheet from "./Sheet"
import ConfirmDialog from "./ConfirmDialog"
import { PrimaryButton, SecondaryButton } from "./ui"
import Icon from "./Icon"
import { ME, MESSAGE_MAX } from "../data"
import { useStore } from "../lib/store-context"
import { isOpen, roleDot, roleOpen } from "../lib/helpers"

// 팀 참여 제안 바텀시트 (REQ-019): 내 모집 중인 글 + 역할 선택
function ProposeSheet({ member, presetPostId, onClose }) {
  const { posts, applications, propose } = useStore()

  // 이미 이 사람과 지원·제안이 오간 글은 제외
  const myOpenPosts = posts.filter(
    (p) =>
      p.authorId === ME &&
      isOpen(p) &&
      !p.team.includes(member.id) &&
      !applications.some((a) => a.postId === p.id && (a.fromId === member.id || a.toId === member.id))
  )

  const [postId, setPostId] = useState(
    myOpenPosts.some((p) => p.id === presetPostId) ? presetPostId : myOpenPosts[0]?.id
  )
  const post = myOpenPosts.find((p) => p.id === postId)
  const [role, setRole] = useState(null)
  const [message, setMessage] = useState("")
  const [sent, setSent] = useState(false)

  const roleOptions = post ? post.desiredRoles.filter((r) => !post.roleCounts || roleOpen(post, r)) : [] // 자리 남은 역할만
  const selectedRole = roleOptions.includes(role)
    ? role
    : roleOptions.find((r) => member.roles.includes(r)) ?? null
  const canSubmit = post && selectedRole && message.trim()

  const [asking, setAsking] = useState(false) // 보내기 전 확인 창
  function submit() {
    setAsking(true)
  }

  if (sent) {
    return (
      <Sheet label="제안 완료" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="w-16 h-16 rounded-full bg-ink text-white flex items-center justify-center">
            <Icon name="send" size={26} />
          </span>
          <h2 className="text-xl font-medium mt-2">{member.name}님에게 제안했어요</h2>
          <p className="text-sm text-sub">수락하면 바로 {selectedRole} 팀원으로 확정돼요.</p>
          <SecondaryButton onClick={onClose} className="mt-3 w-full">확인</SecondaryButton>
        </div>
      </Sheet>
    )
  }

  if (myOpenPosts.length === 0) {
    return (
      <Sheet label="팀 참여 제안" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <h2 className="text-xl font-medium">제안할 수 있는 모집글이 없어요</h2>
          <p className="text-sm text-sub">모집 중인 내 글이 있어야 제안할 수 있어요.</p>
          <Link to="/posts/new" className="mt-3 h-14 w-full rounded-full bg-ink text-white font-medium flex items-center justify-center">
            모집글 쓰기
          </Link>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet label="팀 참여 제안" onClose={onClose}>
      <div>
        <p className="text-sm text-sub">{member.name}님에게</p>
        <h2 className="text-2xl font-normal mt-1">어떤 팀에 제안할까요?</h2>
      </div>

      <div className="flex flex-col gap-2">
        {myOpenPosts.map((p) => (
          <button
            key={p.id}
            onClick={() => setPostId(p.id)}
            aria-pressed={postId === p.id}
            className={`min-h-14 rounded-[22px] border px-4 py-3 text-left text-sm font-medium ${
              postId === p.id ? "bg-ink text-white border-ink" : "bg-white border-line"
            }`}
          >
            {p.title}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">역할</span>
        <div className="flex flex-wrap gap-2">
          {roleOptions.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              aria-pressed={selectedRole === r}
              className={`h-11 px-4 rounded-full border text-sm inline-flex items-center gap-1.5 ${
                selectedRole === r ? "bg-ink text-white border-ink" : "bg-white border-line"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${roleDot[r] ?? "bg-gray-400"}`}></span>
              {r}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">한 줄 메시지</span>
        <span className="h-13 rounded-full bg-white border border-line flex items-center px-5 gap-2 focus-within:border-ink">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MESSAGE_MAX}
            placeholder="함께하고 싶은 이유를 짧게"
            className="flex-1 h-12 outline-none bg-transparent text-sm"
          />
          <span className="text-xs text-sub">{message.length}/{MESSAGE_MAX}</span>
        </span>
      </label>

      <PrimaryButton disabled={!canSubmit} onClick={submit}>제안 보내기</PrimaryButton>
      {asking && (
        <ConfirmDialog
          title={`${member.name}님께 ${selectedRole} 자리를 제안하시겠습니까?`}
          desc={`'${post.title}' 팀 참여 제안이 보내져요.`}
          confirmLabel="제안 보내기"
          onClose={() => setAsking(false)}
          onConfirm={() => {
            propose(post.id, member.id, selectedRole, message.trim())
            setAsking(false)
            setSent(true)
          }}
        />
      )}
    </Sheet>
  )
}

export default ProposeSheet
