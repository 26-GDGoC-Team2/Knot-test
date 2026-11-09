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

// 카드 더미: 뒤에 두 장이 살짝 보이고, 맨 앞 카드는 좌우로 끌어서 넘길 수 있어요
function CardStack({ children, onSwipe, cardKey }) {
  const start = useRef(null)
  const [dx, setDx] = useState(0)

  const down = (e) => {
    start.current = e.clientX
  }
  const move = (e) => {
    if (start.current !== null) setDx(e.clientX - start.current)
  }
  const up = () => {
    if (Math.abs(dx) > 90) onSwipe(dx > 0 ? "right" : "left")
    start.current = null
    setDx(0)
  }

  return (
    <div className="relative mt-4" style={{ minHeight: 430 }}>
      <div aria-hidden="true" className="absolute left-6 right-6 top-0 h-24 rounded-[32px] bg-white/50"></div>
      <div aria-hidden="true" className="absolute left-3 right-3 top-2.5 h-24 rounded-[32px] bg-white/75"></div>
      <article
        key={cardKey}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={() => start.current !== null && up()}
        style={{ transform: `translateX(${dx}px) rotate(${dx / 25}deg)`, touchAction: "pan-y" }}
        className={`relative top-5 rounded-[32px] bg-white shadow-[0_24px_50px_rgba(31,31,31,0.10)] p-[22px] flex flex-col gap-4 select-none fade-in ${
          dx === 0 ? "transition-transform duration-200" : ""
        }`}
      >
        {children}
      </article>
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

  const i = index % list.length
  const { post, reasons } = list[i]
  const author = getPerson(user, post.authorId)
  const next = () => setIndex((v) => v + 1)
  const prev = () => setIndex((v) => (v - 1 + list.length) % list.length)
  const myRole = post.desiredRoles.find((r) => user.roles.includes(r))
  // 이 글에 낸 내 지원 → 아래 버튼 상태
  const myApp = applications.find((a) => a.postId === post.id && a.fromId === ME && a.type === "apply")
  const applyLabel = !myApp ? "지원하기" : myApp.status === "pending" ? "응답 대기 중" : myApp.status === "accepted" ? "수락됐어요" : "지원할 수 없어요"
  const allReasons = [...reasons, ...(myRole ? [`${myRole} 자리 있음`] : [])]

  return (
    <>
      <div className="mt-5">
        <h1 className="text-[28px] font-light tracking-tight leading-tight">
          맞는 모집글 <b className="font-semibold">{i + 1}</b>
          <span className="text-[#9AA0A6]"> / {list.length}</span>
        </h1>
        <p className="text-xs text-sub mt-1">관심 분야·역할·기술 기준 · 모집 중 {openCount}개 중</p>
      </div>

      <CardStack cardKey={post.id} onSwipe={(dir) => (dir === "left" ? next() : prev())}>
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
  const hasNext = turn === 0 // 첫 5명을 다 보면 항상 '다른 후보 보기' (6~10위)
  const noMore = turn === 1 && page.length === 0 // 6위 이하 후보가 없음
  const c = page[index]
  const rankFrom = turn * PAGE + 1

  const restart = () => {
    setTurn(0)
    setIndex(0)
  }

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
              {noMore ? "추천 6~10위" : `추천 ${page.length > 1 ? `${rankFrom}~${rankFrom + page.length - 1}` : rankFrom}위`}
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
                onSwipe={(dir) => setIndex((v) => (dir === "left" ? v + 1 : Math.max(0, v - 1)))} // 왼쪽: 다음, 오른쪽: 이전
              >
                <div className="flex items-center gap-3">
                  <Avatar name={c.member.name} size={52} />
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-semibold flex items-center gap-1.5">
                      {c.member.name}
                    </p>
                    <p className="text-xs text-sub">
                      <b className="font-medium text-ink">{c.role} 후보</b> · {c.member.availableFrom ? `${shortDate(c.member.availableFrom)}부터 가능` : "지금 가능"}
                    </p>
                  </div>
                </div>
                {c.member.bio && <p className="text-sm leading-relaxed text-[#3C4043] line-clamp-3">"{c.member.bio}"</p>}
                {/* 추천 이유가 없으면(조건만 맞는 경우) 칸을 숨겨요 */}
                {c.reasons.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-sub">추천 이유</span>
                    <div className="flex flex-wrap gap-1.5">
                      {c.reasons.map((r) => (
                        <span key={r} className="text-xs px-3 py-1.5 rounded-full bg-[#E8F0FE] text-[#1A56C4] font-medium">{r}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* 수료 기수·프로젝트 경험은 서버가 추천 결과에 안 줘요 → '프로필 전체 보기'에서 확인 */}
                <Link
                  to={`/members/${c.member.id}`}
                  className="h-11 rounded-full border border-line text-sm font-medium flex items-center justify-center gap-1"
                >
                  프로필 전체 보기 <Icon name="next" size={15} />
                </Link>
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
