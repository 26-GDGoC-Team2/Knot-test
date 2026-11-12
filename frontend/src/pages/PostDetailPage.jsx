import { useEffect, useState } from "react"
import { useParams, Link, useNavigate, useLocation } from "react-router-dom"
import Background from "../components/Background"
import Sheet from "../components/Sheet"
import Icon from "../components/Icon"
import ConfirmDialog from "../components/ConfirmDialog"
import {
  TopBar, Chip, Avatar, PrimaryButton, SecondaryButton, EmptyState,
} from "../components/ui"
import { useStore } from "../lib/store-context"
import { ME, MESSAGE_MAX } from "../data"
import { isOpen, shortDate, getPerson, confirmText, closingNotice, roleOpen, roleLeft, roleFilled, roleDot, teamSize, withRo, isIOS } from "../lib/helpers"

// 작성자에게 들어온 지원 목록 (REQ-013)
function ReceivedApplications({ post }) {
  const { user, applications, respond, undoResponse } = useStore()
  const navigate = useNavigate()
  const [ask, setAsk] = useState(null) // 확인 창: { a, accept, changing }
  const list = applications.filter((a) => a.postId === post.id && a.type === "apply")

  if (list.length === 0) {
    return <EmptyState title="아직 들어온 지원이 없어요" desc="AI 추천으로 먼저 제안해 보세요" />
  }

  return (
    <div className="flex flex-col gap-2.5">
      {list.map((a) => {
        const person = getPerson(user, a.fromId)
        return (
          <div key={a.id} className="rounded-[24px] bg-[#F6F7F9] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={person?.name} size={40} />
              <div className="flex-1 min-w-0">
                <Link to={`/members/${a.fromId}`} className="font-semibold">{person?.name}</Link>
                <p className="text-xs text-sub">{a.role} 지원 · {shortDate(a.date)}</p>
              </div>
              {a.status !== "pending" && (
                <Chip variant={a.status === "accepted" ? "success" : "soft"}>
                  {a.status === "accepted" ? "수락함" : a.status === "removed" ? "내보냄" : a.status === "left" ? "팀에서 나감" : a.autoClosed ? "모집 마감" : "거절함"}
                </Chip>
              )}
            </div>
            {a.message && <p className="text-sm text-gray-700">"{a.message}"</p>}
            {a.status !== "pending" && (
              <div className="flex items-center gap-3">
                {/* 응답한 뒤에도 취소할 수 있어요 (모집이 마감되면 못 바꿔요) */}
                {a.autoClosed || a.status === "removed" || a.status === "left" ? null : isOpen(post) ? (
                  <button
                    onClick={() => setAsk({ a, accept: false, changing: true })}
                    className="ml-auto h-8 px-3 rounded-full border border-line bg-white text-xs text-sub"
                  >
                    {a.status === "accepted" ? "수락 취소하기" : "거절 취소하기"}
                  </button>
                ) : (
                  <span className="ml-auto text-xs text-[#9AA0A6]">모집이 마감돼서 바꿀 수 없어요</span>
                )}
              </div>
            )}
            {a.status === "pending" && (
              <div className="flex gap-2">
                <SecondaryButton onClick={() => setAsk({ a, accept: false, changing: false })} className="flex-1 h-11! text-sm">거절</SecondaryButton>
                <PrimaryButton onClick={() => setAsk({ a, accept: true, changing: false })} className="flex-1 h-11! text-sm">수락</PrimaryButton>
              </div>
            )}
          </div>
        )
      })}

      {ask && (() => {
        const t = confirmText(ask.a, getPerson(user, ask.a.fromId)?.name ?? "탈퇴한 회원", ask.accept, ask.changing)
        // 수락: 그 역할 자리가 다 찼거나 마감된 글이면 못 함 / 거절 취소: 마감된 글이면 못 함
        const full = ask.changing
          ? ask.a.status === "rejected" && !isOpen(post)
          : ask.accept && (post.roleCounts ? !roleOpen(post, ask.a.role) : !isOpen(post))
        // 마지막 자리를 수락하면 마감된다고 미리 알려요
        const closing = ask.accept && !ask.changing && !full ? closingNotice(post, ask.a, applications) : null
        return (
          <ConfirmDialog
            title={t.title}
            desc={full ? (ask.changing ? "모집이 마감된 글이라 되돌릴 수 없어요" : `${ask.a.role} 자리가 다 찼거나 마감된 글이라 수락할 수 없어요`) : closing ?? t.desc}
            confirmLabel={t.label}
            danger={t.danger}
            disabled={full}
            onClose={() => setAsk(null)}
            onConfirm={async () => {
              const cur = ask
              setAsk(null)
              if (cur.changing) return undoResponse(cur.a.id)
              // 수락이 서버에 반영된 뒤에 매칭 화면으로 (먼저 가면 잠깐 '수락이 취소된 매칭이에요'가 보였어요)
              const ok = await respond(cur.a.id, cur.accept)
              if (ok && cur.accept) navigate(`/match/${cur.a.id}`)
            }}
          />
        )
      })()}
    </div>
  )
}

// 오픈채팅방 칸: 작성자·확정 팀원에게만 보여요 (링크는 문의용과 같은 방 하나)
// 다른 사람은 모집 중에만 아래 '오픈채팅방' 버튼으로 들어가고, 마감 후에는 링크가 안 보여요
function ChatRoom({ post, isMine, open }) {
  if (!post.openChat) return null
  // 1:1 오픈채팅방: 문의·팀원 확인용 (팀원 확정 후 팀장이 따로 팀 방을 만들어요)
  // 문장마다 줄을 나눠요 (중간에서 어색하게 꺾이지 않게)
  const desc = isMine
    ? ["문의와 팀원 확인용 방이에요.", "팀원 확정 후 별도의 방을 만들어주세요."]
    : ["팀장과 1:1로 이야기하는 방이에요.", "팀 방은 팀장이 따로 만들어요."]
  return (
    <div className="mt-1 rounded-[20px] bg-[#F6F7F9] px-4 py-3 flex items-center gap-3">
      <span className="w-9 h-9 shrink-0 rounded-full bg-white flex items-center justify-center">
        {/* 말풍선 꼬리 때문에 아이콘이 왼쪽 아래로 치우쳐 보여서 살짝 옮겨요 */}
        <Icon name="chat" size={17} className="translate-x-[0.5px] -translate-y-px" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold">오픈채팅방</p>
        <p className="text-xs text-sub">{desc[0]}<br />{desc[1]}</p>
      </div>
      <a
        href={post.openChat}
        target="_blank"
        rel="noreferrer"
        className="h-9 px-3.5 shrink-0 rounded-full bg-ink text-white text-xs font-medium flex items-center"
      >
        들어가기
      </a>
    </div>
  )
}

// 팀원 칩 (아바타 + 이름 + 역할) · onRemove가 있으면 옆에 내보내기(✕) 버튼
function MemberChip({ to, name, sub, leader = false, onRemove }) {
  const chip = (
    <Link to={to} className={`h-9 pl-1 ${onRemove ? "pr-1.5" : "pr-3"} rounded-full bg-[#F6F7F9] flex items-center gap-[7px]`}>
      <span
        className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center ${
          leader ? "bg-ink text-white" : "bg-[#E3E5E8] text-ink"
        }`}
      >
        {name?.slice(0, 1) ?? "?"}
      </span>
      <span className="text-[13px] font-medium">{name ?? "탈퇴한 회원"}</span>
      {sub && <span className="text-[11px] text-sub">{sub}</span>}
    </Link>
  )
  if (!onRemove) return chip
  return (
    <span className="h-9 pr-1 rounded-full bg-[#F6F7F9] flex items-center">
      {chip}
      <button
        aria-label={`${name ?? "탈퇴한 회원"} 내보내기`}
        onClick={onRemove}
        className="w-7 h-7 rounded-full text-[#9AA0A6] flex items-center justify-center"
      >
        <Icon name="close" size={13} />
      </button>
    </span>
  )
}

// 모집글 상세 (참여자: REQ-012·019 / 작성자: REQ-013)
// 디자인: 홈에서 카드를 누르면 아래에서 올라오는 바텀시트 모양
// overlay: 목록 화면 위에 시트로 뜬 경우 (뒤 화면이 그대로 보여요) — 홈 · AI 추천에서 열 때
// overlay가 아니면 화면을 꽉 채운 일반 화면 (위에 ← 뒤로 가기) — 알림 · 내 모집글 · 내역 · 매칭 · 부원 프로필 · 공유 링크
function PostDetailPage({ overlay = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, posts, applications, apply, cancelApplication, closePost, deletePost, removeMember } = useStore()
  const [sheet, setSheet] = useState(null) // null | "menu" | "delete"
  const [confirm, setConfirm] = useState(null) // 확인 창: { title, desc, label, danger, run }
  const post = posts.find((p) => p.id === id)

  // 바로 지원: 고른 역할 + 한 줄 메시지
  const [role, setRole] = useState(() => (post ? post.desiredRoles.find((r) => user.roles.includes(r) && roleOpen(post, r)) : null) ?? null)
  const [message, setMessage] = useState("")

  // 닫기: 시트로 떠 있으면 아래로 내려가는 움직임 뒤에 뒤로 가기
  //       꽉 찬 화면이면 뒤로 가기 (링크로 바로 들어왔으면 홈으로)
  const [closing, setClosing] = useState(false)
  const location = useLocation()
  const close = () => {
    if (overlay) {
      setClosing(true)
      // 아이폰은 창을 열 때 기록을 안 쌓아서(쓸어넘기기로 안 닫히게), 닫을 때 뒤 화면 주소로 바꿔 줘요
      const bg = location.state?.background
      setTimeout(() => (isIOS && bg ? navigate(bg.pathname + bg.search, { replace: true, state: bg.state }) : navigate(-1)), 320)
    } else if (window.history.length > 1) navigate(-1)
    else navigate("/")
  }
  // 시트 / 아래 버튼에 붙는 움직임 (시트로 떴을 때만 아래에서 쭉 올라옴, 꽉 찬 화면은 움직임 없음)
  const slide = overlay ? (closing ? "sheet-slide-down" : "sheet-slide-up") : ""

  // 시트가 떠 있는 동안 뒤 화면이 같이 스크롤되지 않게
  useEffect(() => {
    if (!overlay) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [overlay])

  if (!post) {
    return (
      <Background>
        <TopBar />
        <EmptyState title="모집글을 찾을 수 없어요" action={<Link to="/" className="underline">홈으로</Link>} />
      </Background>
    )
  }

  const open = isOpen(post)
  // 내 글 = 작성자만 (운영진도 남의 글에서는 일반 부원처럼 지원할 수 있어요. 운영진은 아래 adminDelete로 삭제만 가능)
  const isMine = post.authorId === ME
  // 운영진은 남의 글을 삭제만 할 수 있어요 (문제 있는 글 정리용 · 회의 결정). 수정·마감은 작성자만
  const adminDelete = !isMine && user.role === "ADMIN" && Boolean(post.canManage)
  const author = getPerson(user, post.authorId)
  const myApplication = applications.find((a) => a.postId === post.id && a.fromId === ME && a.type === "apply")
  const isTeamMember = post.team.includes(ME)
  const canApply = open && !isMine && !isTeamMember && !myApplication
  const empty = post.roleCounts ? post.desiredRoles.reduce((n, r) => n + roleLeft(post, r), 0) : Math.max(0, post.recruitCount - teamSize(post))

  // 한 줄 메시지는 선택 (역할만 골라도 지원 가능)
  function submit() {
    if (!role) return
    setConfirm({
      title: `'${post.title}'에 ${withRo(role)} 지원하시겠습니까?`,
      desc: "응답을 받기 전까지는 지원을 취소할 수 있어요",
      label: "지원하기",
      run: () => {
        apply(post, role, message.trim())
        setMessage("")
      },
    })
  }

  return (
    <div
      className={
        overlay
          ? "fixed inset-0 z-[60] overflow-y-auto overflow-x-hidden no-scrollbar [overflow-anchor:none]" /* 컴퓨터에서 올라오는 동안 스크롤바가 생겼다 사라지며 시트가 옆으로 흔들리지 않게 */
          : "min-h-screen bg-white relative overflow-x-hidden"
      }
    >
      {/* 시트일 때만: 뒤 화면 어둡게 (시트와 따로 서서히) + 위쪽 빈 곳 누르면 닫기 */}
      {overlay && (
        <>
          <div aria-hidden="true" className={`fixed inset-0 bg-black/25 ${closing ? "fade-out" : "fade-in"}`}></div>
          <button aria-label="닫기" onClick={close} className="fixed inset-x-0 top-0 h-16 z-10"></button>
        </>
      )}

      {/* 시트: 둥근 위쪽 + 손잡이 / 꽉 찬 화면: 위에 ← 뒤로 가기 */}
      <section
        aria-label="모집글 상세"
        className={
          overlay
            ? `${slide} relative z-20 max-w-md mx-auto mt-16 min-h-[calc(100vh-64px)] rounded-t-[34px] bg-white will-change-transform shadow-[0_-16px_40px_rgba(31,31,31,0.08)] px-[22px] pt-3 pb-40 flex flex-col gap-[18px]`
            : "relative max-w-md mx-auto min-h-screen bg-white px-[22px] pt-5 pb-40 flex flex-col gap-[18px]"
        }
      >
        {overlay ? (
          <span aria-hidden="true" className="self-center w-10 h-[5px] rounded-full bg-[#DADCE0]"></span>
        ) : (
          <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-1">
            <div className="flex justify-start">
              <button onClick={close} aria-label="뒤로" className="w-11 h-11 rounded-full bg-[#F1F3F4] flex items-center justify-center">
                <Icon name="back" size={18} />
              </button>
            </div>
            <span className="text-base font-semibold">모집글</span>
            <div className="flex justify-end">
              {(isMine || adminDelete) && (
                <button onClick={() => setSheet("menu")} aria-label="관리 메뉴" className="w-11 h-11 rounded-full bg-[#F1F3F4] flex items-center justify-center">
                  <Icon name="edit" size={17} />
                </button>
              )}
            </div>
          </header>
        )}

        {/* 기간 + 제목 */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              {/* 상태 점: 글자 ● 대신 작은 원 (역할 점과 같은 크기) / 날짜 숫자도 한글과 같은 글씨체로 */}
              <span className={`text-xs font-medium inline-flex items-center gap-1.5 ${open ? "text-[#137333]" : "text-gray-400"}`}>
                <span className="ml-[1.5px] w-1.5 h-1.5 shrink-0 rounded-full bg-current"></span>
                {/* 글자는 한 덩어리로 묶어야 점과의 간격(gap)이 글자 사이에 끼지 않아요 */}
                <span>
                  {open ? "모집 중" : "모집 완료"} · 등록 <span className="ml-[3px] font-['Noto_Sans_KR']">{shortDate(post.createdAt)}</span>
                </span>
              </span>
              <p className="mt-1.5 text-[44px] font-light leading-none tracking-[-1.6px]">{shortDate(post.startDate)}</p>
              <p className="text-[44px] font-light leading-[1.05] tracking-[-1.6px] text-sub">
                <span className="text-[#9AA0A6]">→</span> {shortDate(post.endDate)}
              </p>
            </div>
            {/* 시트일 때만 오른쪽 위 버튼 (꽉 찬 화면은 맨 위 줄에 있어요) */}
            {overlay && (
            <div className="flex gap-2">
              {(isMine || adminDelete) && (
                <button
                  onClick={() => setSheet("menu")}
                  aria-label="관리 메뉴"
                  className="w-11 h-11 rounded-full bg-[#F1F3F4] flex items-center justify-center"
                >
                  <Icon name="edit" size={17} />
                </button>
              )}
              <button
                onClick={close}
                aria-label="닫기"
                className="w-11 h-11 rounded-full bg-[#F1F3F4] flex items-center justify-center"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
            )}
          </div>
          <h1 className="mt-2.5 text-[21px] font-semibold leading-[1.3] tracking-[-0.5px]">{post.title}</h1>
          <Link to={isMine ? "/me" : `/members/${post.authorId}`} className="text-[13px] text-sub">
            {author?.name ?? "탈퇴한 회원"} 팀장
          </Link>
        </div>

        {/* 소개 */}
        <p className="text-sm leading-[1.65] text-[#3C4043]">{post.description}</p>

        {/* 역할별 필요 기술 (지원할 역할을 고르면 그 역할이 강조돼요) */}
        {/* 기술은 선택 입력이라, 어느 역할에도 기술이 없으면 이 칸을 숨겨요 */}
        {post.roleSkills ? (
          post.desiredRoles.some((r) => post.roleSkills[r]?.required.length || post.roleSkills[r]?.preferred.length) && (
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold">역할별 필요 기술</span>
            {post.desiredRoles.map((r) => {
              const rs = post.roleSkills[r]
              if (!rs) return null
              const on = canApply && role === r
              return (
                <div
                  key={r}
                  className={`rounded-[18px] px-3.5 py-3 flex items-start gap-3 border ${on ? "border-ink bg-white" : "border-transparent bg-[#F6F7F9]"}`}
                >
                  <span className="w-12 shrink-0 pt-[5px] text-[13px] font-medium inline-flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${roleDot[r] ?? "bg-gray-400"}`}></span>
                    {r}
                  </span>
                  <div className="flex-1 flex gap-1.5 flex-wrap">
                    {rs.required.map((s) => (
                      <span key={s} className="text-xs px-[11px] py-1.5 rounded-full border border-ink bg-ink text-white">필수 {s}</span>
                    ))}
                    {rs.preferred.map((s) => (
                      <span key={s} className="text-xs px-[11px] py-1.5 rounded-full border border-[#DADCE0] bg-white">우대 {s}</span>
                    ))}
                    {rs.required.length + rs.preferred.length === 0 && (
                      <span className="pt-[5px] text-xs text-sub">따로 정한 기술 없음</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          )
        ) : (
          <div className="flex gap-1.5 flex-wrap">
            {post.requiredSkills.map((s) => (
              <span key={s} className="text-xs px-[11px] py-1.5 rounded-full border border-ink bg-ink text-white">필수 {s}</span>
            ))}
            {post.preferredSkills.map((s) => (
              <span key={s} className="text-xs px-[11px] py-1.5 rounded-full border border-[#DADCE0]">우대 {s}</span>
            ))}
          </div>
        )}

        {/* 관심 분야 */}
        {post.interests.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {post.interests.map((i) => (
              <span key={i} className="text-xs px-[11px] py-1.5 rounded-full bg-[#F1F3F4] text-sub">#{i}</span>
            ))}
          </div>
        )}

        {/* 확정 팀원 */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-baseline">
            <span className="text-[15px] font-semibold">
              확정 팀원 <span className="text-sub font-medium">{teamSize(post)}/{post.recruitCount}</span>
            </span>
            <span className="text-xs text-sub">빈자리 {empty}</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <MemberChip to={isMine ? "/me" : `/members/${post.authorId}`} name={author?.name} sub={post.leaderRole ? `팀장 · ${post.leaderRole}` : "팀장"} leader />
            {post.team.map((mid) => {
              const m = getPerson(user, mid)
              // 모집이 끝난 뒤에는 팀장이 팀원을 내보낼 수 있어요 (모집 중에는 '수락 취소'로)
              const kick =
                isMine && !open
                  ? () =>
                      setConfirm({
                        title: `${m?.name ?? "탈퇴한 회원"}님을 팀에서 내보내시겠습니까?`,
                        desc: "그 역할 자리가 다시 비고 모집이 다시 열려요. 내보낸 사람도 오픈채팅방 링크를 알고 있으니, 링크를 새로 바꾸는 걸 추천해요.",
                        label: "내보내기",
                        danger: true,
                        run: () => removeMember(post.id, mid),
                      })
                  : undefined
              return <MemberChip key={mid} to={mid === ME ? "/me" : `/members/${mid}`} name={m?.name} sub={post.teamRoles?.[mid] ?? m?.roles?.[0]} onRemove={kick} />
            })}
          </div>
          {/* 역할별 모집 현황: FE 1/2 */}
          {post.roleCounts && (
            <div className="flex gap-1.5 flex-wrap">
              {post.desiredRoles.map((r) => {
                const full = roleLeft(post, r) === 0
                return (
                  <span
                    key={r}
                    className={`h-7 px-2.5 rounded-full text-xs inline-flex items-center gap-1.5 ${full ? "bg-[#F1F3F4] text-[#9AA0A6]" : "bg-white border border-line"}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${full ? "bg-gray-300" : roleDot[r] ?? "bg-gray-400"}`}></span>
                    {r} {roleFilled(post, r)}/{post.roleCounts[r]}
                    {full && " · 마감"}
                  </span>
                )
              })}
            </div>
          )}
          {(isMine || isTeamMember) && <ChatRoom post={post} isMine={isMine} open={open} />}
        </div>

        {/* 참여자: 역할 골라 바로 지원 (REQ-019) */}
        {canApply && (
          <div className="flex flex-col gap-2.5">
            <span className="text-[15px] font-semibold">역할 골라 바로 지원</span>
            <div className="grid grid-cols-3 gap-2">
              {post.desiredRoles.map((r) => {
                const on = role === r
                const left = post.roleCounts ? roleLeft(post, r) : 1
                return (
                  <button
                    key={r}
                    aria-pressed={on}
                    disabled={left === 0}
                    onClick={() => setRole(r)}
                    className={`h-[68px] rounded-[22px] flex flex-col items-center justify-center gap-0.5 disabled:bg-[#F1F3F4] disabled:text-[#9AA0A6] disabled:border-transparent ${
                      on ? "border-[1.5px] border-ink bg-ink text-white" : "border border-line bg-white text-ink"
                    }`}
                  >
                    <span className="text-[15px] font-medium">{r}</span>
                    {post.roleCounts && (
                      <span className={`text-[11px] ${on ? "text-white/70" : "text-sub"}`}>{left === 0 ? "마감" : `${left}자리 남음`}</span>
                    )}
                  </button>
                )
              })}
            </div>
            <label className="h-[52px] rounded-full bg-[#F6F7F9] border border-line flex items-center gap-2 px-[18px]">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                placeholder="한 줄 메시지 (선택)"
                aria-label="한 줄 메시지"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm text-ink"
              />
              <span className="text-xs text-sub">
                {message.length}/{MESSAGE_MAX}
              </span>
            </label>
          </div>
        )}

        {/* 작성자: 들어온 지원 */}
        {isMine && (
          <div className="flex flex-col gap-2.5">
            <span className="text-[15px] font-semibold">들어온 지원</span>
            <ReceivedApplications post={post} />
          </div>
        )}
      </section>

      {/* 하단 버튼: 오픈채팅 + 지원하기 */}
      <div className="fixed left-0 right-0 bottom-0 z-30 pointer-events-none">
        <div className={`${slide} pointer-events-auto max-w-md mx-auto px-[22px] pb-6 pt-3 bg-gradient-to-t from-white via-white/90 to-transparent flex gap-2`}>
          {/* 오픈채팅방 버튼: 다른 사람 글 · 모집 중일 때만 (마감 후에는 링크를 숨겨요. 작성자·팀원은 위 '오픈채팅방' 칸으로) */}
          {!isMine && !isTeamMember && open && (
            <a
              href={post.openChat}
              target="_blank"
              rel="noreferrer"
              aria-label="오픈채팅방 열기"
              className="h-[58px] px-5 shrink-0 rounded-full bg-[#F1F3F4] text-ink text-[15px] font-medium whitespace-nowrap flex items-center justify-center gap-1.5"
            >
              {/* 말풍선 꼬리 때문에 아이콘이 살짝 아래로 보여서 1px 올려요 */}
              <Icon name="chat" size={18} className="-translate-y-px" />
              <span className="leading-none">오픈채팅방</span>
            </a>
          )}
          {isMine ? (
            <Link
              to={`/ai?tab=members&post=${post.id}`}
              className={`flex-1 min-w-0 h-[58px] rounded-full bg-ink text-white text-base font-medium whitespace-nowrap flex items-center justify-center gap-2 ${
                open ? "" : "pointer-events-none bg-gray-300!"
              }`}
            >
              <Icon name="sparkle" size={15} /> AI 팀원 추천
            </Link>
          ) : isTeamMember ? (
            <PrimaryButton disabled className="flex-1 h-[58px]!">이미 팀원이에요</PrimaryButton>
          ) : myApplication ? (
            myApplication.status === "pending" ? (
              <SecondaryButton
                onClick={() =>
                  setConfirm({
                    title: "지원을 취소하시겠습니까?",
                    desc: "취소한 지원은 내역에서 사라져요",
                    label: "지원 취소",
                    danger: true,
                    run: () => cancelApplication(myApplication.id),
                  })
                }
                className="flex-1 h-[58px]!"
              >
                지원 취소
              </SecondaryButton>
            ) : (
              <PrimaryButton disabled className="flex-1 h-[58px]!">
                {myApplication.status === "accepted" ? "수락됐어요" : myApplication.status === "removed" ? "팀에서 빠졌어요" : myApplication.status === "left" ? "팀에서 나갔어요" : "이번엔 함께하지 못해요"}
              </PrimaryButton>
            )
          ) : (
            <PrimaryButton
              disabled={!open || !role}
              onClick={submit}
              className="flex-1 h-[58px]! text-base"
            >
              {!open ? "모집이 마감됐어요" : role ? `${withRo(role)} 지원하기` : "역할을 골라 주세요"}
            </PrimaryButton>
          )}
        </div>
      </div>

      {sheet === "menu" && (
        <Sheet label="모집글 관리" onClose={() => setSheet(null)}>
          <h2 className="text-xl font-medium">{isMine ? "모집글 관리" : "운영진 관리"}</h2>
          {!isMine && <p className="text-sm text-sub -mt-2">운영진은 다른 사람의 모집글을 삭제할 수 있어요</p>}
          <div className="flex flex-col gap-2">
            {isMine && (
            <>
            <SecondaryButton onClick={() => navigate(`/posts/${post.id}/edit`)}>수정하기</SecondaryButton>
            <SecondaryButton
              disabled={!open}
              onClick={() => {
                setSheet(null)
                setConfirm({
                  title: "모집을 마감하시겠습니까?",
                  desc: "마감하면 되돌릴 수 없어요. 대기 중인 지원·제안은 자동으로 거절되고, 팀원의 수락도 취소할 수 없어요.",
                  label: "마감하기",
                  danger: true,
                  run: () => closePost(post.id),
                })
              }}
            >
              모집 마감하기
            </SecondaryButton>
            </>
            )}
            <SecondaryButton onClick={() => setSheet("delete")} className="text-red-600!">삭제하기</SecondaryButton>
          </div>
          <p className="text-xs text-sub">마감하거나 삭제하면 대기 중인 지원·제안은 자동으로 거절돼요</p>
        </Sheet>
      )}

      {sheet === "delete" && (
        <Sheet label="삭제 확인" onClose={() => setSheet(null)}>
          <h2 className="text-xl font-medium">모집글을 삭제할까요?</h2>
          <p className="text-sm text-sub">
            삭제하면 되돌릴 수 없어요.
            {post.team.length > 0 && (
              <b className="block mt-1 text-red-600 font-medium">
                확정 팀원 {post.team.length}명이 있어요. 삭제하면 팀원들도 이 모집글과 팀 정보를 볼 수 없어요.
              </b>
            )}
          </p>
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setSheet(null)} className="flex-1">취소</SecondaryButton>
            <PrimaryButton
              onClick={() => {
                deletePost(post.id)
                navigate(isMine ? "/my-posts" : "/", { replace: true }) // 운영진이 남의 글을 지우면 홈으로
              }}
              className="flex-1 bg-red-600!"
            >
              삭제
            </PrimaryButton>
          </div>
        </Sheet>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          desc={confirm.desc}
          confirmLabel={confirm.label}
          danger={confirm.danger}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run()
            setConfirm(null)
          }}
        />
      )}
    </div>
  )
}

export default PostDetailPage
