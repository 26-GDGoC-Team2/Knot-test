import { Link, useNavigate, useParams } from "react-router-dom"
import Icon from "../components/Icon"
import { useStore } from "../lib/store-context"
import { ME } from "../data"
import { getPerson, shortDate, teamSize, withRo } from "../lib/helpers"

const ROLE_NAME = { FE: "프론트엔드", BE: "백엔드", 디자인: "디자이너", 기획: "기획", "AI/Data": "AI/Data" }

// 매칭 성사 (지원·제안을 수락했을 때)
function MatchPage() {
  const { id } = useParams() // 지원·제안 id
  const navigate = useNavigate()
  const { user, posts, applications } = useStore()
  const app = applications.find((a) => a.id === id)

  const post = app && posts.find((p) => p.id === app.postId)

  const close = () => (window.history.length > 1 ? navigate(-1) : navigate("/activity"))

  // 볼 수 없는 경우: 매칭이 없거나, 수락 상태가 아니거나(취소됨), 내가 당사자가 아니거나, 모집글이 삭제됨
  const isParty = app && (app.fromId === ME || app.toId === ME)
  const reason = !app || !isParty
    ? "매칭 정보를 찾을 수 없어요"
    : app.status === "removed"
      ? "팀에서 빠진 매칭이에요"
      : app.status === "left"
      ? "팀에서 나간 매칭이에요"
      : app.status !== "accepted"
      ? "수락이 취소된 매칭이에요"
      : !post
        ? "삭제된 모집글이에요"
        : null
  if (reason) {
    return (
      <div className="min-h-dvh bg-page flex flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="font-medium">{reason}</p>
        <Link to="/activity" replace className="underline text-sm">내역으로</Link>
      </div>
    )
  }

  // 팀에 들어간 사람: 지원이면 지원한 사람, 제안이면 제안 받은 사람
  const memberId = app.type === "apply" ? app.fromId : app.toId
  const iJoined = memberId === ME // 내가 남의 팀에 들어간 경우
  const leader = getPerson(user, post.authorId)
  const member = getPerson(user, memberId)
  const other = iJoined ? leader : member
  const meName = user.name || "나"
  const chatReady = iJoined && !!post.openChat // 채팅방 버튼 (링크 하나로 합쳐서 모집 중에도 바로 들어갈 수 있어요)

  return (
    <div className="min-h-dvh bg-page relative overflow-hidden flex flex-col">
      {/* GDGoC 4색 빛번짐 */}
      <div
        aria-hidden="true"
        className="absolute w-[360px] h-[360px] left-1/2 -translate-x-1/2 top-[150px] rounded-full blur-[50px] fade-in"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(66,133,244,0.45), rgba(234,67,53,0.35), rgba(251,188,4,0.4), rgba(52,168,83,0.4), rgba(66,133,244,0.45))",
        }}
      ></div>

      <div className="relative max-w-md w-full mx-auto flex-1 flex flex-col px-5 pt-5 pb-8">
        <button
          aria-label="닫기"
          onClick={close}
          className="self-end w-11 h-11 rounded-full bg-white/65 border border-white flex items-center justify-center"
        >
          <Icon name="close" size={18} strokeWidth={2} />
        </button>

        <div className="flex flex-col items-center text-center pt-6">
          <span className="text-[13px] font-medium px-3 py-1.5 rounded-full bg-white/70 border border-white">
            {app.role} 합류 🎉
          </span>
          <h1 className="mt-4 text-[38px] font-light leading-[1.15] tracking-[-1.4px]">
            한 팀이<br />
            <b className="font-semibold">됐어요!</b>
          </h1>

          {/* 두 사람 아바타 */}
          <div className="mt-8 flex items-center">
            <span className="pop-in w-[108px] h-[108px] rounded-full bg-white/85 border-4 border-white shadow-[0_16px_40px_rgba(31,31,31,0.12)] text-[38px] font-semibold flex items-center justify-center">
              {meName.slice(0, 1)}
            </span>
            <span
              className="pop-in w-[108px] h-[108px] -ml-[22px] rounded-full bg-ink text-white border-4 border-white shadow-[0_16px_40px_rgba(31,31,31,0.18)] text-[38px] font-semibold flex items-center justify-center"
              style={{ animationDelay: "0.12s" }}
            >
              {other?.name?.slice(0, 1) ?? "?"}
            </span>
          </div>

          <p className="mt-7 w-full text-[15px] leading-relaxed text-[#3C4043]" style={{ textWrap: "wrap" }}>{/* 가로 폭을 꽉 써서 필요할 때만 줄바꿈 (전체 줄바꿈 설정 때문에 폭이 좁게 잡혀 단어마다 줄이 바뀌었어요) */}
            {iJoined ? (
              <>
                {leader?.name}님 팀의 <b>{post.title}</b>에<br />
                {withRo(ROLE_NAME[app.role] ?? app.role)} 함께해요.
              </>
            ) : (
              <>
                {member?.name}님이 <b>{post.title}</b>에<br />
                {withRo(ROLE_NAME[app.role] ?? app.role)} 합류했어요.
              </>
            )}
          </p>
          <p className="mt-1.5 w-full text-[13px] text-sub">
            {shortDate(post.startDate)} 시작 · 팀원 {teamSize(post)} / {post.recruitCount}명 모였어요
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-2.5 pt-6">
          {/* 내가 팀에 들어간 경우: 모집글의 오픈채팅방 버튼 */}
          {/* 버튼 위 안내 */}
          {chatReady && <p className="text-center text-[13px] text-sub leading-relaxed break-keep">문의와 팀원 확인용 방이에요.<br />팀원 확정 후 팀장이 별도의 방을 만들어요.</p>}
          {chatReady && (
              <a
                href={post.openChat}
                target="_blank"
                rel="noreferrer"
                className="h-[58px] rounded-full bg-ink text-white text-base font-medium flex items-center justify-center gap-2"
              >
                <Icon name="chat" size={19} /> 오픈채팅방 들어가기
              </a>
          )}
          <Link
            to={`/posts/${post.id}`}
            replace
            className={
              chatReady
                ? "h-[54px] rounded-full border border-white bg-white/70 text-[15px] flex items-center justify-center"
                : "h-[58px] rounded-full bg-ink text-white text-base font-medium flex items-center justify-center"
            }
          >
            팀 보러 가기
          </Link>
        </div>
      </div>
    </div>
  )
}

export default MatchPage
