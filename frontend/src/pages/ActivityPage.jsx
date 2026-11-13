import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import Background from "../components/Background"
import BottomNav from "../components/BottomNav"
import { EmptyState } from "../components/ui"
import ConfirmDialog from "../components/ConfirmDialog"
import { useStore } from "../lib/store-context"
import { ME } from "../data"
import { getPerson, shortDate, isOpen, roleOpen, confirmText, closingNotice, today, withRo } from "../lib/helpers"

// 매칭됐지만 진행 기간이 끝났는지 (모집글이 없어도 끝난 걸로)
function isEnded(a, posts) {
  if (a.status !== "accepted") return false
  const post = posts.find((p) => p.id === a.postId)
  return !post || (post.endDate && post.endDate < today())
}

// 지난 내역은 최근 1년 것만
// 기준 날짜: 진행이 끝난 매칭은 진행 종료일, 그 외에는 지원·제안한 날
const ONE_YEAR_DAYS = 365
function withinYear(a, posts) {
  const post = posts.find((p) => p.id === a.postId)
  const base = a.status === "accepted" && post?.endDate && post.endDate > a.date ? post.endDate : a.date
  return (new Date(today()) - new Date(base)) / 86400000 <= ONE_YEAR_DAYS
}

// 카드 한 줄 설명
function describe(a, other, received, ended) {
  const name = other?.name ?? "탈퇴한 회원"
  if (a.status === "accepted") return ended ? `${name}님과 함께했어요` : `${name}님과 한 팀이 됐어요`
  if (received) return a.type === "apply" ? `${name}님이 ${withRo(a.role)} 지원했어요` : `${name}님이 ${a.role} 자리를 제안했어요`
  return a.type === "apply" ? `${withRo(a.role)} 지원했어요` : `${name}님께 ${a.role} 자리를 제안했어요`
}

// 카드 윗줄: 링크가 있으면 눌러서 이동
function TopRow({ to, className, children }) {
  if (!to) return <div className={className}>{children}</div>
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  )
}

// 내역 카드
function ActivityCard({ a, received, onAccept, onReject, onCancel, onChange }) {
  const { user, posts } = useStore()
  const post = posts.find((p) => p.id === a.postId)
  const other = getPerson(user, received ? a.fromId : a.toId)
  const ended = isEnded(a, posts) // 진행 기간이 끝난 매칭 → 지난 내역에 보여요
  const matched = a.status === "accepted" && !ended
  const dim = ["rejected", "removed", "left"].includes(a.status) // 거절·팀에서 빠짐·나감은 흐리게
  const accepted = a.status === "accepted" // 매칭된 카드는 눌러서 매칭 화면으로

  const body = (
    <div className="rounded-[22px] bg-white px-4 py-3.5 flex flex-col gap-2.5">
      <TopRow to={accepted ? `/match/${a.id}` : null} className={`flex items-start gap-3 ${dim ? "opacity-55" : ""}`}>
        <span
          className={`w-10 h-10 shrink-0 rounded-full text-[15px] font-semibold flex items-center justify-center ${
            matched ? "bg-ink text-white" : "bg-[#EDEFF2]"
          }`}
        >
          {other?.name?.slice(0, 1) ?? "?"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[10px] font-medium px-1.5 py-[2px] rounded-md ${
                a.type === "apply" ? "bg-[#E8F0FE] text-[#1967D2]" : "bg-[#FEF7E0] text-[#B06000]"
              }`}
            >
              {a.type === "apply" ? "지원" : "제안"}
            </span>
            <span className="text-[11px] text-sub">{shortDate(a.date)}</span>
          </div>
          <p className={`mt-1 text-sm leading-snug ${a.status === "pending" ? "font-semibold" : "font-medium"}`}>{describe(a, other, received, ended)}</p>
          <p className="text-xs text-sub truncate">{post ? post.title : "삭제된 모집글"}</p>
        </div>
        {dim && (
          <span className="text-[11px] text-sub shrink-0">
            {a.status === "removed" ? (received ? "내보냄" : "팀에서 빠짐") : a.status === "left" ? "팀에서 나감" : a.autoClosed ? "모집 마감" : received ? "거절함" : "거절됨"}
          </span>
        )}
      </TopRow>

      {a.message && a.status === "pending" && (
        <p className="text-[13px] leading-relaxed text-[#3C4043] bg-[#F6F7F9] rounded-2xl px-3 py-2">{a.message}</p>
      )}

      {a.status === "pending" && received && (
        <div className="flex gap-2">
          <button onClick={onReject} className="flex-1 h-11 rounded-full border border-line text-sm">
            거절
          </button>
          <button onClick={onAccept} className="flex-[2] h-11 rounded-full bg-ink text-white text-sm font-medium">
            수락하기
          </button>
        </div>
      )}
      {a.status === "pending" && !received && (
        <button onClick={onCancel} className="self-start h-8 px-3 rounded-full border border-line text-xs text-sub">
          {a.type === "apply" ? "지원 취소하기" : "제안 취소하기"}
        </button>
      )}

      {matched && (
        <p className="text-[13px] pt-0.5 text-sub">🎉 {withRo(a.role)} 함께해요</p>
      )}

      {ended && <p className="text-[13px] pt-0.5 text-sub">{withRo(a.role)} 함께한 프로젝트 · 진행 끝</p>}

      {/* 응답한 뒤에도 취소할 수 있어요 (모집이 마감됐거나 진행이 끝나면 못 바꿔요) */}
      {received && ["accepted", "rejected"].includes(a.status) && !ended && !a.autoClosed &&
        (post && isOpen(post) ? (
          <button onClick={onChange} className="self-start h-8 px-3 rounded-full border border-line text-xs text-sub">
            {matched ? "수락 취소하기" : "거절 취소하기"}
          </button>
        ) : (
          <p className="text-xs text-[#9AA0A6]">모집이 마감돼서 바꿀 수 없어요</p>
        ))}
    </div>
  )

  // 새 매칭은 알림("한 팀이 됐어요")으로 알려 주니까 내역에서는 따로 강조하지 않아요
  return <div className="rounded-[24px] border border-white">{body}</div>
}

function Section({ title, count, children }) {
  if (count === 0) return null
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-[13px] font-semibold text-[#3C4043]">
        {title} <span className="text-sub font-normal">{count}</span>
      </h2>
      {children}
    </section>
  )
}

// 내역 (REQ-020): 받은 요청 / 보낸 요청
function ActivityPage() {
  const { user, posts, applications, respond, undoResponse, cancelApplication } = useStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [box, setBox] = useState(params.get("box") === "sent" ? "sent" : "received") // received | sent (알림에서 ?box=sent로 열면 보낸 요청부터)
  const [ask, setAsk] = useState(null) // 확인 창: { a, accept, changing }

  const received = box === "received"
  const mine = applications
    .filter((a) => (received ? a.toId === ME : a.fromId === ME))
    .sort((x, y) => y.date.localeCompare(x.date))
  const pending = mine.filter((a) => a.status === "pending")
  // 매칭 성사: 진행 기간이 끝나기 전까지 / 지난 내역: 끝난 매칭 + 거절 + 팀에서 빠짐, 최근 1년 것만
  const matched = mine.filter((a) => a.status === "accepted" && !isEnded(a, posts))
  const done = mine.filter((a) => (["rejected", "removed", "left"].includes(a.status) || isEnded(a, posts)) && withinYear(a, posts))

  const receivedPending = applications.filter((a) => a.toId === ME && a.status === "pending").length

  const card = (a) => (
    <ActivityCard
      key={a.id}
      a={a}
      received={received}
      onAccept={() => setAsk({ a, accept: true, changing: false })}
      onReject={() => setAsk({ a, accept: false, changing: false })}
      onChange={() => setAsk({ a, accept: false, changing: true })}
      onCancel={() => setAsk({ a, cancel: true })}
    />
  )

  // 확인 창 내용
  let dialog = null
  if (ask?.cancel) {
    const post = posts.find((p) => p.id === ask.a.postId)
    dialog = (
      <ConfirmDialog
        title={post ? `'${post.title}' ${ask.a.type === "apply" ? "지원" : "제안"}을 취소하시겠습니까?` : `${ask.a.type === "apply" ? "지원" : "제안"}을 취소하시겠습니까?`}
        desc={ask.a.type === "apply" ? "취소한 지원은 내역에서 사라져요" : "취소한 제안은 내역에서 사라지고, 받은 사람에게도 더 이상 보이지 않아요"}
        confirmLabel={ask.a.type === "apply" ? "지원 취소" : "제안 취소"}
        danger
        onClose={() => setAsk(null)}
        onConfirm={() => {
          cancelApplication(ask.a.id)
          setAsk(null)
        }}
      />
    )
  } else if (ask) {
    const name = getPerson(user, ask.a.fromId)?.name ?? "탈퇴한 회원"
    const t = confirmText(ask.a, name, ask.accept, ask.changing)
    const post = posts.find((p) => p.id === ask.a.postId)
    // 수락: 그 역할 자리가 다 찼거나 마감된 글이면 못 함 / 거절 취소: 마감된 글이면 못 함
    const full = ask.changing
      ? ask.a.status === "rejected" && post && !isOpen(post)
      : ask.accept && post && (post.roleCounts ? !roleOpen(post, ask.a.role) : !isOpen(post))
    // 마지막 자리를 수락하면 마감된다고 미리 알려요
    const closing = ask.accept && !ask.changing && !full ? closingNotice(post, ask.a, applications) : null
    dialog = (
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
  }

  return (
    <Background plain>
      <h1 className="text-[26px] font-semibold tracking-[-0.5px]">내역</h1>

      {/* 받은 / 보낸 */}
      <div className="mt-3 grid grid-cols-2 p-1 rounded-full bg-[#EDEFF2]">
        {[
          { v: "received", label: "받은 요청", badge: receivedPending },
          { v: "sent", label: "보낸 요청" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setBox(t.v)}
            className={`h-10 rounded-full text-sm flex items-center justify-center gap-1.5 transition-colors ${
              box === t.v ? "bg-white font-semibold shadow-[0_2px_8px_rgba(31,31,31,0.08)]" : "text-sub"
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#EA4335] text-white text-[10px] font-semibold flex items-center justify-center">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-6">
        {mine.length === 0 ? (
          <EmptyState
            title={received ? "아직 받은 요청이 없어요" : "아직 보낸 요청이 없어요"}
            desc={received ? "모집글을 올리면 지원이 들어와요" : "마음에 드는 모집글에 지원해 보세요"}
          />
        ) : (
          <>
            <Section title={received ? "응답이 필요해요" : "응답 기다리는 중"} count={pending.length}>
              {pending.map(card)}
            </Section>
            <Section title="매칭 성사 · 진행 중" count={matched.length}>
              {matched.map(card)}
            </Section>
            <Section title="지난 내역 · 최근 1년" count={done.length}>
              {done.map(card)}
            </Section>
          </>
        )}
      </div>

      {dialog}
      <BottomNav />
    </Background>
  )
}

export default ActivityPage
