import { useRef, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import Background from "../components/Background"
import ProposeSheet from "../components/ProposeSheet"
import ApplySheet from "../components/ApplySheet"
import Sheet from "../components/Sheet"
import SelectChips from "../components/SelectChips"
import Icon from "../components/Icon"
import { Avatar, EmptyState, PrimaryButton } from "../components/ui"
import { useStore } from "../lib/store-context"
import { matchPost, recommendMembers, defaultCondition } from "../lib/recommend"
import { ME, SKILLS } from "../data"
import { isOpen, shortDate, getPerson, today, teamSize, roleLeft } from "../lib/helpers"

// 마감까지 남은 날 (D-12 같은 표시)
function dday(date) {
  const diff = Math.ceil((new Date(date) - new Date(today())) / 86400000)
  return diff > 0 ? `D-${diff}` : diff === 0 ? "D-day" : "진행 중"
}

// 카드 더미
// - 왼쪽으로 끌기: 맨 앞 카드가 왼쪽으로 날아가고, 밑에 깔려 있던 다음 카드가 올라와요
// - 오른쪽으로 끌기: 아까 왼쪽으로 날아갔던 이전 카드가 왼쪽에서 손을 따라 다시 들어와 맨 앞에 놓여요
// peek: { left: 다음 카드 내용, right: 이전 카드 내용 } (없으면 null → 그쪽으로는 안 넘어가요)
const FLY_MS = 340 // 움직이는 시간 (아래 duration-[340ms]도 같이 바꿔야 해요)
const OFF = -520 // 화면 왼쪽 밖 위치 (다음으로 넘길 때 날아가는 곳)
const IN_FROM = -420 // 이전 카드가 출발하는 곳: 화면 바로 바깥 (멀리서 오면 너무 빨라 보였어요)
const IN_SPEED = 1.2 // 이전 카드는 손가락의 1.2배로 따라와요 (예전 2.6배는 너무 빨랐어요)
const SETTLE = "transition-transform duration-[340ms] ease-[cubic-bezier(0.25,0.8,0.4,1)]"

function CardStack({ children, onSwipe, cardKey, peek = {} }) {
  const start = useRef(null)
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState(null) // 넘어가는 중인 방향 ("left" / "right")
  const [back, setBack] = useState(false) // 이전 카드를 덜 끌어서 다시 왼쪽 밖으로 돌아가는 중

  // 새 카드 등장 움직임: 카드가 바뀌는 순간에 한 번만 정해요 (끌어서 넘긴 카드는 이미 제자리에 있어서 생략)
  const skipNext = useRef(false)
  const intro = useRef({ key: null, on: true })
  if (intro.current.key !== cardKey) {
    intro.current = { key: cardKey, on: !skipNext.current }
    skipNext.current = false
  }

  const down = (e) => {
    if (leaving || back) return
    start.current = e.clientX
  }
  const move = (e) => {
    if (start.current !== null) setDx(e.clientX - start.current)
  }
  const up = () => {
    if (start.current === null) return
    start.current = null
    const dir = dx > 0 ? "right" : "left"
    if (Math.abs(dx) > 90 && peek[dir]) {
      setLeaving(dir)
      setTimeout(() => {
        skipNext.current = true
        onSwipe(dir)
        setLeaving(null)
        setDx(0)
      }, FLY_MS)
    } else {
      if (dx > 0 && peek.right) {
        setBack(true)
        setTimeout(() => setBack(false), FLY_MS)
      }
      setDx(0) // 덜 끌었으면 제자리로 돌아와요
    }
  }

  // ── 지금 움직임 계산 ──
  const settling = Boolean(leaving) || dx === 0 // 손을 뗀 뒤 자리 찾아가는 중
  const goingLeft = leaving === "left" || (!leaving && dx < 0)
  const comingBack = Boolean(peek.right) && (leaving === "right" || back || (!leaving && dx > 0))

  // 왼쪽: 맨 앞 카드 위치 / 밑 카드가 올라오는 정도
  // 넘어갈 카드가 없는 쪽으로 끌면 살짝만 밀렸다 돌아와요
  const x = leaving === "left" ? OFF : goingLeft ? (peek.left ? dx : dx * 0.3) : comingBack ? 0 : dx * 0.3
  const pl = Math.min(Math.abs(x) / 160, 1)
  // 오른쪽: 이전 카드가 들어온 정도 / 맨 앞 카드는 그만큼 뒤로 물러나요
  const inX = leaving === "right" ? 0 : back ? IN_FROM : Math.min(0, IN_FROM + dx * IN_SPEED)
  const pr = comingBack ? 1 - inX / IN_FROM : 0

  const cardClass = "rounded-[32px] bg-white shadow-[0_24px_50px_rgba(31,31,31,0.10)] p-[22px] flex flex-col gap-4 select-none"

  return (
    <div className="relative mt-4" style={{ minHeight: 430 }}>
      <div aria-hidden="true" className="absolute left-6 right-6 top-0 h-24 rounded-[32px] bg-white/50"></div>
      <div aria-hidden="true" className="absolute left-3 right-3 top-2.5 h-24 rounded-[32px] bg-white/75"></div>
      {/* 왼쪽으로 끌 때: 밑에 미리 보이는 다음 카드 */}
      {goingLeft && peek.left && (
        <article
          aria-hidden="true"
          inert
          style={{ transform: `translateY(${-12 * (1 - pl)}px) scale(${0.94 + 0.06 * pl})` }}
          className={`absolute left-0 right-0 top-5 pointer-events-none ${cardClass} ${settling ? SETTLE : ""}`}
        >
          {peek.left}
        </article>
      )}
      {/* 맨 앞 카드 */}
      <article
        key={cardKey}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={() => start.current !== null && up()}
        style={{
          transform: comingBack
            ? `translateY(${-12 * pr}px) scale(${1 - 0.06 * pr})`
            : `translateX(${x}px) rotate(${x / 25}deg)`,
          touchAction: "pan-y",
        }}
        className={`relative top-5 ${cardClass} ${intro.current.on ? "card-in" : ""} ${settling || back ? SETTLE : ""}`}
      >
        {children}
      </article>
      {/* 오른쪽으로 끌 때: 왼쪽에서 다시 들어오는 이전 카드 (맨 앞 카드 위에 놓여요) */}
      {comingBack && (
        <article
          aria-hidden="true"
          inert
          style={{ transform: `translateX(${inX}px) rotate(${inX / 25}deg)` }}
          className={`absolute left-0 right-0 top-5 z-10 pointer-events-none ${cardClass} ${settling || back ? SETTLE : ""}`}
        >
          {peek.right}
        </article>
      )}
    </div>
  )
}


// ── 모집글 추천 (REQ-017) ──
function PostRecommend({ user, posts }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { applications } = useStore()
  const [index, setIndex] = useState(0)
  const [applying, setApplying] = useState(null) // 지원 창을 띄울 모집글

  const list = posts
    .filter((p) => isOpen(p) && p.authorId !== ME && !p.team.includes(ME)) // 내 글·이미 팀원인 글은 빼요
    .map((p) => ({ post: p, ...matchPost(user, p) }))
    .filter((s) => s.isMatch)
    .sort((a, b) => b.score - a.score)
  const openCount = posts.filter((p) => isOpen(p) && p.authorId !== ME).length

  if (list.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="지금은 딱 맞는 모집글이 없어요"
          desc="프로필에 역할·기술·관심 분야를 더 적으면 추천이 정확해져요."
          action={<Link to="/" className="h-12 px-6 rounded-full bg-ink text-white text-sm font-medium inline-flex items-center">전체 모집글 보기</Link>}
        />
      </div>
    )
  }

  const len = list.length
  const i = Math.min(index, len - 1) // 끝까지 가면 더 넘어가지 않아요 (처음↔끝으로 돌지 않음)
  const { post } = list[i]
  const next = () => setIndex(Math.min(i + 1, len - 1))
  const prev = () => setIndex(Math.max(i - 1, 0))
  // 이 글에 낸 내 지원 → 아래 버튼 상태
  const myApp = applications.find((a) => a.postId === post.id && a.fromId === ME && a.type === "apply")
  const applyLabel = !myApp ? "지원하기" : myApp.status === "pending" ? "응답 대기 중" : myApp.status === "accepted" ? "수락됐어요" : "지원할 수 없어요"

  // 카드 안 내용 (앞 카드와 밑에 미리 보이는 카드에 같이 써요)
  const postCard = (item) => {
    const post = item.post
    const author = getPerson(user, post.authorId)
    const myRole = post.desiredRoles.find((r) => user.roles.includes(r))
    const allReasons = [...item.reasons, ...(myRole ? [`${myRole} 자리 있음`] : [])]
    return (
      <>
        {/* 상태 점: 작은 원 / 날짜 숫자는 한글과 같은 글씨체 (모집글 상세와 같게) */}
        <span className="text-xs font-medium text-[#137333] inline-flex items-center gap-1.5">
          <span className="ml-[1.5px] w-1.5 h-1.5 shrink-0 rounded-full bg-current"></span>
          <span>
            모집 중 · <span className="font-['Noto_Sans_KR']">{dday(post.endDate)}</span>
          </span>
        </span>
        <h2 className="text-2xl font-semibold leading-snug tracking-tight">{post.title}</h2>
        <p className="text-sm leading-relaxed text-[#3C4043] line-clamp-3">{post.description}</p>
        <div className="flex flex-col gap-2">
          <span className="text-xs text-sub">추천 이유</span>
          <div className="flex flex-wrap gap-1.5">
            {allReasons.map((r) => (
              <span key={r} className="text-xs px-3 py-1.5 rounded-full bg-[#E8F0FE] text-[#1A56C4] font-medium">{r}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center">
            {[post.authorId, ...post.team].map((id, k) => (
              <span
                key={id}
                className={`w-8 h-8 rounded-full border-2 border-white text-xs font-semibold flex items-center justify-center ${
                  k === 0 ? "bg-ink text-white" : "bg-[#E3E5E8]"
                } ${k > 0 ? "-ml-2" : ""}`}
              >
                {getPerson(user, id)?.name?.slice(0, 1) ?? "?"}
              </span>
            ))}
            {Array.from({ length: Math.max(0, post.recruitCount - teamSize(post)) }).map((_, k) => (
              <span key={k} className="w-8 h-8 -ml-2 rounded-full border-2 border-dashed border-[#BDC1C6] bg-white"></span>
            ))}
          </div>
          <span className="text-xs text-sub">
            {author?.name} 팀장 · 빈자리 {Math.max(0, post.recruitCount - teamSize(post))}
          </span>
        </div>
        {/* 부원 추천의 '프로필 전체 보기'와 같은 자리 */}
        <button
          onClick={() => navigate(`/posts/${post.id}`, { state: { background: location } })}
          className="h-11 rounded-full border border-line text-sm font-medium flex items-center justify-center gap-1"
        >
          모집글 자세히 보기 <Icon name="next" size={15} />
        </button>
      </>
    )
  }
  // 첫 카드에선 이전, 마지막 카드에선 다음이 없어요 → 그쪽으로 끌면 살짝 밀렸다 제자리로
  const peek = { left: i < len - 1 ? postCard(list[i + 1]) : null, right: i > 0 ? postCard(list[i - 1]) : null }

  return (
    <>
      <div className="mt-5">
        <h1 className="text-[28px] font-light tracking-tight leading-tight">
          맞는 모집글 <b className="font-semibold">{i + 1}</b>
          <span className="text-[#9AA0A6]"> / {list.length}</span>
        </h1>
        <p className="text-xs text-sub mt-1">관심 분야·역할·기술 기준 · 모집 중 {openCount}개 중</p>
      </div>

      <CardStack cardKey={post.id} peek={peek} onSwipe={(dir) => (dir === "left" ? next() : prev())}>
        {postCard(list[i])}
      </CardStack>

      {/* 부원 추천의 '제안 보내기'와 같은 자리: 바로 지원 (이미 지원했으면 상태만 보여요) */}
      <div className="mt-10 flex justify-center">
        <button
          onClick={() => setApplying(post)}
          disabled={Boolean(myApp)}
          className="h-16 w-[176px] rounded-full bg-ink text-white text-base font-medium disabled:bg-gray-300"
        >
          {applyLabel}
        </button>
      </div>
      <p className="text-center text-xs text-[#9AA0A6] mt-3">← 끌어서 넘기기 →</p>
      {applying && <ApplySheet post={applying} onClose={() => setApplying(null)} />}
    </>
  )
}

// ── 부원 추천 (REQ-015): 내 모집 중인 글이 있을 때만 ──
// AI팀 흐름: 1~5위 → [다른 후보 보기] 6~10위 → [조건 바꿔 다시 추천] 조건 수정 → 새로운 1~5위
const PAGE = 5

// 조건 수정 시트: 모집 역할 · 필수 기술 · 우대 기술 (이번 추천에만 적용, 모집글은 안 바뀌어요)
function ConditionSheet({ post, initial, onApply, onClose }) {
  const [draft, setDraft] = useState(initial)
  const set = (key, v) => setDraft((d) => ({ ...d, [key]: v }))
  // 같은 기술이 필수·우대에 동시에 들어가지 않게
  const setSkills = (kind, list) =>
    setDraft((d) => {
      const other = kind === "required" ? "preferred" : "required"
      return { ...d, [kind]: list, [other]: d[other].filter((x) => !list.includes(x)) }
    })
  const roleOptions = post.desiredRoles.filter((r) => roleLeft(post, r) > 0)

  return (
    <Sheet label="조건 바꿔 다시 추천" onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">추천 조건 바꾸기</h2>
        <button onClick={() => setDraft(defaultCondition(post))} className="text-[13px] text-sub underline underline-offset-2">
          모집글 기준으로
        </button>
      </div>
      <p className="-mt-3 text-xs text-sub">이번 추천에만 적용돼요. 모집글은 바뀌지 않아요.</p>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">모집 역할</span>
        <SelectChips options={roleOptions} value={draft.roles} onChange={(v) => set("roles", v)} showRoleDot />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">필수 기술</span>
        <SelectChips options={SKILLS} value={draft.required} onChange={(v) => setSkills("required", v)} searchable />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">우대 기술</span>
        <SelectChips options={SKILLS} value={draft.preferred} onChange={(v) => setSkills("preferred", v)} searchable />
      </div>

      <PrimaryButton
        disabled={draft.roles.length === 0}
        onClick={() => {
          onApply(draft)
          onClose()
        }}
      >
        {draft.roles.length === 0 ? "모집 역할을 하나 이상 골라 주세요" : "이 조건으로 다시 추천"}
      </PrimaryButton>
    </Sheet>
  )
}

// 부원 추천 마지막 카드를 넘길 때 밑에 보이는 자리 (넘기면 '모두 봤어요' 화면이 나와요)
function EndPeek() {
  return (
    <div className="py-16 flex flex-col items-center text-center gap-1">
      <p className="text-lg font-semibold">이번 후보를 모두 봤어요</p>
      <p className="text-sm text-sub">넘기면 다음 단계를 볼 수 있어요</p>
    </div>
  )
}

function MemberRecommend({ myPosts, applications, presetPostId }) {
  // 모집글 상세에서 들어오면 그 글이 먼저 골라져 있어요
  const [postIdx, setPostIdx] = useState(() => Math.max(0, myPosts.findIndex((p) => p.id === presetPostId)))
  const post = myPosts[postIdx % myPosts.length]
  const [cond, setCond] = useState(null) // null = 모집글 기준 조건
  const [turn, setTurn] = useState(0) // 0: 1~5위, 1: 6~10위
  const [index, setIndex] = useState(0) // 이번 5명 중 몇 번째 카드
  const [proposeTo, setProposeTo] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false) // 내 모집글 목록 펼침
  const [condOpen, setCondOpen] = useState(false) // 조건 수정 시트

  const all = recommendMembers(post, applications, cond ?? defaultCondition(post))
  const page = all.slice(turn * PAGE, turn * PAGE + PAGE) // 이번에 보여 줄 최대 5명
  const done = index >= page.length // 이번 후보를 다 넘김
  // 첫 5명을 꽉 채워 받았을 때만 '다른 후보 보기' (6위 이하). 5명보다 적으면 그게 전부라 바로 '조건 바꿔 다시 추천'
  const hasNext = turn === 0 && page.length === PAGE
  const noMore = turn === 1 && page.length === 0 // 6위 이하 후보가 없음
  const c = page[index]
  const rankFrom = turn * PAGE + 1

  const restart = () => {
    setTurn(0)
    setIndex(0)
  }

  // 카드 안 내용 (앞 카드와 밑에 미리 보이는 카드에 같이 써요)
  const memberCard = (m) => (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={m.member.name} size={52} />
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold flex items-center gap-1.5">
            {m.member.name}
          </p>
          <p className="text-xs text-sub">
            <b className="font-medium text-ink">{m.role} 후보</b> · {m.member.availableFrom ? `${shortDate(m.member.availableFrom)}부터 가능` : "지금 가능"}
          </p>
        </div>
      </div>
      {m.member.bio && <p className="text-sm leading-relaxed text-[#3C4043] line-clamp-3">"{m.member.bio}"</p>}
      {/* 추천 이유가 없으면(조건만 맞는 경우) 칸을 숨겨요 */}
      {m.reasons.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-sub">추천 이유</span>
          <div className="flex flex-wrap gap-1.5">
            {m.reasons.map((r) => (
              <span key={r} className="text-xs px-3 py-1.5 rounded-full bg-[#E8F0FE] text-[#1A56C4] font-medium">{r}</span>
            ))}
          </div>
        </div>
      )}
      {/* 수료 기수·프로젝트 경험은 서버가 추천 결과에 안 줘요 → '프로필 전체 보기'에서 확인 */}
      <Link
        to={`/members/${m.member.id}`}
        className="h-11 rounded-full border border-line text-sm font-medium flex items-center justify-center gap-1"
      >
        프로필 전체 보기 <Icon name="next" size={15} />
      </Link>
    </>
  )
  const peek = c
    ? {
        left: page[index + 1] ? memberCard(page[index + 1]) : <EndPeek />, // 마지막 카드 뒤엔 '모두 봤어요' 카드
        right: index > 0 ? memberCard(page[index - 1]) : null, // 첫 카드에선 이전으로 못 넘겨요
      }
    : {}

  return (
    <>
      {/* 어떤 내 모집글 기준인지: 누르면 내 모집글 목록이 펼쳐져서 고를 수 있어요 */}
      <div className="mt-4 rounded-3xl bg-white/80 border border-white overflow-hidden">
        <button
          onClick={() => myPosts.length > 1 && setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="w-full p-4 flex items-center gap-3 text-left"
        >
          <div className="flex-1 min-w-0">
            <span className="text-xs text-sub">내 모집글 기준{cond ? " · 조건 바꿈" : ""}</span>
            <p className="text-[15px] font-semibold truncate">{post.title}</p>
          </div>
          {myPosts.length > 1 && (
            <span className="w-8 h-8 rounded-full bg-[#F1F3F4] text-sub flex items-center justify-center shrink-0">
              <Icon name="next" size={13} className={`transition-transform ${pickerOpen ? "-rotate-90" : "rotate-90"}`} />
            </span>
          )}
        </button>
        {pickerOpen && (
          <ul className="border-t border-[#F1F3F4] px-2 py-2 flex flex-col fade-in" role="listbox" aria-label="내 모집글 고르기">
            {myPosts.map((p, k) => {
              const on = k === postIdx % myPosts.length
              return (
                <li key={p.id}>
                  <button
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      setPostIdx(k)
                      setCond(null)
                      restart()
                      setPickerOpen(false)
                    }}
                    className={`w-full rounded-2xl px-3 py-2.5 flex items-center gap-2 text-left ${on ? "bg-[#F6F7F9]" : ""}`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${on ? "font-semibold" : ""}`}>{p.title}</span>
                      <span className="block text-[11px] text-sub">{p.desiredRoles.join(" · ")} 모집</span>
                    </span>
                    {on && <Icon name="check" size={16} strokeWidth={2.4} />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {all.length === 0 ? (
        <div className="mt-5 flex flex-col gap-3">
          <EmptyState title="지금은 추천할 후보가 없어요" desc="역할·기술·참여 가능 시점이 맞는 부원이 없어요." />
          <button onClick={() => setCondOpen(true)} className="self-center h-12 px-6 rounded-full bg-ink text-white text-sm font-medium">
            조건 바꿔 다시 추천
          </button>
        </div>
      ) : (
        <>
          {/* 이번 후보 순위와 몇 번째인지 */}
          <div className="mt-3 flex items-center justify-between px-0.5">
            <span className="text-[13px] font-semibold">
              {noMore ? "다음 순위 후보 없음" : `추천 ${page.length > 1 ? `${rankFrom}~${rankFrom + page.length - 1}` : rankFrom}위`}
              {!done && <span className="text-sub font-normal"> · {index + 1}/{page.length}</span>}
            </span>
            <span className="text-xs text-sub">AI가 고른 {all.length}명</span>
          </div>

          {done ? (
            // 이번 5명을 다 넘기면: 다른 후보 보기(6~10위) → 그다음엔 조건 바꿔 다시 추천
            <div className="mt-4 rounded-[30px] bg-white border border-white shadow-[0_20px_40px_rgba(0,0,0,0.05)] px-6 py-10 flex flex-col items-center text-center gap-2">
              <p className="text-lg font-semibold">
                {hasNext ? `${page.length}명을 모두 봤어요` : noMore ? "더 추천할 후보가 없어요" : "추천 후보를 모두 봤어요"}
              </p>
              <p className="text-sm text-sub">
                {hasNext ? "다음 순위 후보를 볼 수 있어요." : "역할이나 기술 조건을 바꾸면 새로 추천해 드려요."}
              </p>
              <button
                onClick={() => (hasNext ? (setTurn(1), setIndex(0)) : setCondOpen(true))}
                className="mt-4 h-12 px-6 rounded-full bg-ink text-white text-sm font-medium"
              >
                {hasNext ? "다른 후보 보기" : "조건 바꿔 다시 추천"}
              </button>
              <button
                onClick={() => (noMore ? restart() : setIndex(0))}
                className="h-10 px-3 text-[13px] text-sub underline underline-offset-2"
              >
                {noMore ? "1~5위 다시 보기" : "이번 후보 다시 보기"}
              </button>
            </div>
          ) : (
            <>
              <CardStack
                cardKey={`${turn}-${c.member.id}`}
                peek={peek}
                onSwipe={(dir) => setIndex((v) => (dir === "left" ? v + 1 : Math.max(0, v - 1)))} // 왼쪽: 다음, 오른쪽: 이전
              >
                {memberCard(c)}
              </CardStack>

              {/* 넘기기(X)는 뺐어요: 카드를 좌우로 끌어서 넘겨요 */}
              <div className="mt-10 flex justify-center">
                <button
                  onClick={() => setProposeTo(c.member)}
                  className="h-16 w-[176px] rounded-full bg-ink text-white text-base font-medium flex items-center justify-center gap-2"
                >
                  <Icon name="send" size={17} /> 제안 보내기
                </button>
              </div>
              <p className="text-center text-xs text-[#9AA0A6] mt-3">← 끌어서 넘기기 →</p>
            </>
          )}
        </>
      )}

      {condOpen && (
        <ConditionSheet
          post={post}
          initial={cond ?? defaultCondition(post)}
          onApply={(next) => {
            setCond(next)
            restart() // 새 조건으로 다시 1~5위부터
          }}
          onClose={() => setCondOpen(false)}
        />
      )}
      {proposeTo && <ProposeSheet member={proposeTo} presetPostId={post.id} onClose={() => setProposeTo(null)} />}
    </>
  )
}

// AI 추천 (+ 버튼 → AI 추천): 모집글 탭 / 부원 탭
function AIRecommendPage() {
  const navigate = useNavigate()
  const { user, posts, applications } = useStore()
  const [params, setParams] = useSearchParams()

  const myPosts = posts.filter((p) => p.authorId === ME && isOpen(p))
  const hasMine = myPosts.length > 0
  const tab = params.get("tab") === "members" && hasMine ? "members" : "posts"

  return (
    <Background plain>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            aria-label="뒤로"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            className="w-11 h-11 rounded-full bg-white/65 border border-white flex items-center justify-center"
          >
            <Icon name="back" size={18} />
          </button>
          {/* 내 모집글이 없으면 부원 탭은 숨김 */}
          {hasMine ? (
            <div role="tablist" className="flex gap-0.5 bg-white/65 border border-white rounded-full p-1">
              {[
                { value: "posts", label: "모집글" },
                { value: "members", label: "부원" },
              ].map((t) => (
                <button
                  key={t.value}
                  role="tab"
                  aria-selected={tab === t.value}
                  onClick={() => setParams(t.value === "members" ? { tab: "members" } : {}, { replace: true })} // 탭 바꾸기는 뒤로 가기 기록에 안 남겨요
                  className={`h-9 px-4 rounded-full text-[13px] ${tab === t.value ? "bg-ink text-white font-medium" : "text-sub"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-base font-semibold ml-1">AI 추천</span>
          )}
        </div>
        {/* 다시 추천은 후보를 다 넘긴 뒤 카드 자리에서 ('다른 후보 보기' → '조건 바꿔 다시 추천') */}
        <span className="h-10 px-3.5 rounded-full bg-white/65 border border-white text-[13px] flex items-center gap-1.5 text-sub">
          <Icon name="sparkle" size={13} /> AI 추천
        </span>
      </header>

      {tab === "posts" ? (
        <PostRecommend user={user} posts={posts} />
      ) : (
        <MemberRecommend myPosts={myPosts} applications={applications} presetPostId={params.get("post")} />
      )}
    </Background>
  )
}

export default AIRecommendPage
