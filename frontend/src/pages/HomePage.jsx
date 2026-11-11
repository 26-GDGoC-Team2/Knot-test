import { useState } from "react"
import PostCard from "../components/PostCard"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import Background from "../components/Background"
import BottomNav from "../components/BottomNav"
import Icon from "../components/Icon"
import { Avatar, CompletedBadge, EmptyState } from "../components/ui"
import FilterSheet, { EMPTY_FILTER, INTEREST_OPTIONS } from "../components/FilterSheet"
import { useStore } from "../lib/store-context"
import { members, ROLES } from "../data"
import { isOpen, isVisibleNoti } from "../lib/helpers"
import { matchPost } from "../lib/recommend"

// 검색어가 모집글 제목·기술·관심 분야에 들어 있는지
function postMatchesQuery(post, q) {
  if (!q) return true
  const text = [post.title, ...post.requiredSkills, ...post.preferredSkills, ...post.interests].join(" ")
  return text.toLowerCase().includes(q.toLowerCase())
}

// 모집글이 필터 조건에 맞는지 (역할·기술·관심 분야는 하나라도 겹치면 통과)
function postMatchesFilter(post, f) {
  if (f.onlyOpen && !isOpen(post)) return false
  if (f.roles.length && !f.roles.some((r) => post.desiredRoles.includes(r))) return false
  const skills = [...post.requiredSkills, ...post.preferredSkills]
  if (f.skills.length && !f.skills.some((s) => skills.includes(s))) return false
  if (f.interests.length && !f.interests.some((i) => post.interests.includes(i))) return false
  return true
}

// 관심 분야 값 → 칩에 보이는 이름 (예: "금융/핀테크" → "핀테크")
const interestLabel = (v) => INTEREST_OPTIONS.find((o) => o.value === v)?.label ?? v

// 부원이 기술·관심 조건에 맞는지 (하나라도 겹치면 통과)
function memberMatchesFilter(member, f) {
  if (f.skills.length && !f.skills.some((s) => member.skills.includes(s))) return false
  if (f.interests.length && !f.interests.some((i) => member.interests.includes(i))) return false
  return true
}

function memberMatchesQuery(member, q) {
  if (!q) return true
  const text = [member.name, ...member.skills, ...member.interests].join(" ")
  return text.toLowerCase().includes(q.toLowerCase())
}

// 역할 칩 한 줄 (전체 / PM / 디자인 / ...)
function RoleChips({ value, onChange, extraCount = 0, onExtra }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
      {["전체", ...ROLES].map((r) => {
        const active = value === r
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            className={`h-[38px] px-3.5 rounded-full text-[13px] whitespace-nowrap ${
              active ? "bg-ink text-white" : "bg-white/70 border border-white"
            }`}
          >
            {r}
          </button>
        )
      })}
      {/* 기술·관심 필터 (누르면 바텀시트) */}
      <button
        onClick={onExtra}
        className={`h-[38px] px-3.5 rounded-full text-[13px] whitespace-nowrap ${
          extraCount > 0 ? "bg-ink text-white" : "bg-white/70 border border-white"
        }`}
      >
        기술·관심{extraCount > 0 ? ` ${extraCount}` : ""} ▾
      </button>
    </div>
  )
}

// 적용된 필터 칩 (× 누르면 해제)
function AppliedChip({ children, onRemove }) {
  return (
    <button
      onClick={onRemove}
      className="h-8 px-3 rounded-full bg-white/75 border border-white text-xs inline-flex items-center gap-1.5"
    >
      {children}
      <span aria-hidden="true" className="text-sub">×</span>
    </button>
  )
}

// 홈 부원 한 줄 (디자인: J · 홈 · 부원 탭)
function HomeMemberRow({ member }) {
  return (
    <Link to={`/members/${member.id}`} className="block">
      <article
        className={`rounded-3xl border border-white p-3.5 flex items-center gap-3 ${
          member.available ? "bg-white/80" : "bg-white/50 text-[#6B7075]"
        }`}
      >
        <Avatar name={member.name} size={48} />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold flex items-center gap-1.5">
            {member.name}
            <CompletedBadge gens={member.completedGens} />
          </p>
          <p className="mt-0.5 text-xs text-sub truncate">
            {member.available
              ? `${member.roles.join("·")} · ${member.skills.slice(0, 2).join(", ")} · #${member.interests[0]}`
              : `${member.roles.join("·")} · 참여 불가`}
          </p>
        </div>
      </article>
    </Link>
  )
}

// 홈: 모집글 탭 / 부원 탭 (REQ-009, REQ-010)
function HomePage() {
  const { user, posts, notifications, applications } = useStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") === "members" ? "members" : "posts"

  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState(EMPTY_FILTER) // 모집글 필터 (바텀시트에서 적용)
  const [memberRole, setMemberRole] = useState("전체") // 부원 탭 역할 칩
  const [memberFilter, setMemberFilter] = useState({ skills: [], interests: [] }) // 부원 탭 기술·관심
  const [memberSheetOpen, setMemberSheetOpen] = useState(false)
  const [forMe, setForMe] = useState(false) // + 버튼 → AI 추천 (AI 추천 화면 만들기 전까지 임시)
  const [filterOpen, setFilterOpen] = useState(false)
  const [fabOpen, setFabOpen] = useState(false) // + 버튼 펼침 여부

  // 알림 화면에 보이는 최근 30일 알림 중 안 읽은 것만 (오래된 알림 때문에 점이 안 지워지는 일 없게)
  const unread = notifications.filter((n) => !n.read && isVisibleNoti(n, applications)).length

  // 나에게 맞는 모집글 (내 글 제외, 모집 중)
  const scored = posts.map((p) => ({ post: p, ...matchPost(user, p) }))
  const matched = scored.filter((s) => s.isMatch && isOpen(s.post) && s.post.authorId !== user.id)

  // 필터 바텀시트의 "모집글 N개 보기"에도 같은 계산을 씀
  const filterPosts = (f) =>
    scored
      .filter((s) => postMatchesFilter(s.post, f))
      .filter((s) => postMatchesQuery(s.post, query))
      .filter((s) => !forMe || matched.includes(s))

  let postList = filterPosts(filter)
  postList = forMe
    ? [...postList].sort((a, b) => b.score - a.score)
    : [...postList].sort((a, b) => (b.post.createdAt ?? "").localeCompare(a.post.createdAt ?? ""))

  const filterMembers = (f) =>
    members
      .filter((m) => !m.withdrawn) // 탈퇴한 회원은 부원 목록에서 빼요
      .filter((m) => memberRole === "전체" || m.roles.includes(memberRole))
      .filter((m) => memberMatchesQuery(m, query))
      .filter((m) => memberMatchesFilter(m, f))
  const memberList = filterMembers(memberFilter)

  const filterCount = (filter.onlyOpen ? 1 : 0) + filter.roles.length + filter.skills.length + filter.interests.length
  const removeFrom = (key, item) => setFilter((f) => ({ ...f, [key]: f[key].filter((x) => x !== item) }))

  const switchTab = (value) => {
    setParams(value === "members" ? { tab: "members" } : {})
    setQuery("")
    setFilterOpen(false)
  }

  return (
    <Background plain>
      <div className="flex flex-col gap-3.5">
        {/* 상단: 모집글/부원 탭 + 알림 */}
        <header className="flex items-center justify-between">
          <div role="tablist" className="flex gap-0.5 bg-white/65 border border-white rounded-full p-1">
            {[
              { value: "posts", label: "모집글" },
              { value: "members", label: "부원" },
            ].map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => switchTab(t.value)}
                className={`h-9 px-4 rounded-full text-[13px] ${
                  tab === t.value ? "bg-ink text-white font-medium" : "text-sub"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Link
            to="/notifications"
            aria-label="알림 목록"
            className="relative w-11 h-11 rounded-full bg-white/65 border border-white flex items-center justify-center"
          >
            <Icon name="bell" size={18} />
            {unread > 0 && <span className="absolute left-[22px] top-[11px] w-[8px] h-[8px] rounded-full bg-g-red border border-white"></span>}
          </Link>
        </header>

        {tab === "posts" ? (
          <>
            {/* 검색 + 필터 버튼 */}
            <div className="flex gap-2">
              <label className="flex-1 h-12 rounded-full bg-white/75 border border-white flex items-center gap-2 px-4 text-sub">
                <Icon name="search" size={17} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="프로젝트, 기술 검색"
                  aria-label="모집글 검색"
                  className="flex-1 bg-transparent outline-none text-sm text-ink"
                />
              </label>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                aria-label={`필터 ${filterCount}개 적용됨`}
                aria-expanded={filterOpen}
                className="h-12 px-3.5 rounded-full bg-ink text-white text-[13px] flex items-center gap-1.5"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                  <circle cx="16" cy="7" r="2" />
                  <circle cx="10" cy="17" r="2" />
                </svg>
                {filterCount}
              </button>
            </div>

            {/* 적용된 필터 + 개수 */}
            <div className="flex gap-1.5 flex-wrap items-center">
              {forMe && <AppliedChip onRemove={() => setForMe(false)}>AI 추천</AppliedChip>}
              {filter.onlyOpen && (
                <AppliedChip onRemove={() => setFilter((f) => ({ ...f, onlyOpen: false }))}>모집 중만</AppliedChip>
              )}
              {["roles", "skills", "interests"].flatMap((key) =>
                filter[key].map((item) => (
                  <AppliedChip key={key + item} onRemove={() => removeFrom(key, item)}>
                    {key === "interests" ? interestLabel(item) : item}
                  </AppliedChip>
                ))
              )}
              <span className="ml-auto text-xs text-sub">
                {postList.length}개 · {forMe ? "나에게 맞는 순" : "최신순"}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {postList.length === 0 ? (
                <EmptyState title="조건에 맞는 모집글이 없어요" desc="필터를 바꾸거나 직접 모집글을 올려 보세요." />
              ) : (
                postList.map((s) => <PostCard key={s.post.id} post={s.post} asSheet />)
              )}
            </div>
          </>
        ) : (
          <>
            <label className="h-12 rounded-full bg-white/75 border border-white flex items-center gap-2 px-4 text-sub">
              <Icon name="search" size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름으로 검색"
                aria-label="부원 이름 검색"
                className="flex-1 bg-transparent outline-none text-sm text-ink"
              />
            </label>

            <RoleChips
              value={memberRole}
              onChange={setMemberRole}
              extraCount={memberFilter.skills.length + memberFilter.interests.length}
              onExtra={() => setMemberSheetOpen(true)}
            />

            <div className="flex flex-col gap-2">
              <span className="text-xs text-sub">전체 {memberList.length}명</span>
              {memberList.length === 0 ? (
                <EmptyState title="조건에 맞는 부원이 없어요" />
              ) : (
                memberList.map((m) => <HomeMemberRow key={m.id} member={m} />)
              )}
            </div>
          </>
        )}
      </div>

      {/* 필터 바텀시트 */}
      {filterOpen && (
        <FilterSheet
          value={filter}
          countFor={(f) => filterPosts(f).length}
          onApply={setFilter}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {memberSheetOpen && (
        <FilterSheet
          mode="members"
          value={{ ...EMPTY_FILTER, ...memberFilter }}
          countFor={(f) => filterMembers(f).length}
          onApply={(f) => setMemberFilter({ skills: f.skills, interests: f.interests })}
          onClose={() => setMemberSheetOpen(false)}
        />
      )}

      {/* + 버튼: 누르면 [AI 추천] [모집글 쓰기]가 펼쳐져요 */}
      {fabOpen && (
        <button
          aria-label="닫기"
          onClick={() => setFabOpen(false)}
          className="fixed inset-0 z-40 bg-black/40"
        ></button>
      )}
      {/* + 버튼: 화면 끝이 아니라 앱 영역(아래 탭과 같은 너비)의 오른쪽에 붙어요 → 컴퓨터에서도 아래 탭 오른쪽 위 */}
      <div className="fixed inset-x-0 bottom-28 z-[45] px-5 pointer-events-none">
      <div className="max-w-md mx-auto flex flex-col items-end gap-3 [&>*]:pointer-events-auto">
        {fabOpen && (
          <>
            <button
              onClick={() => {
                setFabOpen(false)
                navigate("/ai")
              }}
              className="h-12 pl-4 pr-5 rounded-full bg-white text-ink text-sm font-medium shadow-[0_8px_20px_rgba(31,31,31,0.15)] flex items-center gap-2"
            >
              <Icon name="sparkle" size={16} /> AI 추천
            </button>
            <Link
              to="/posts/new"
              className="h-12 pl-4 pr-5 rounded-full bg-white text-ink text-sm font-medium shadow-[0_8px_20px_rgba(31,31,31,0.15)] flex items-center gap-2"
            >
              <Icon name="edit" size={16} /> 모집글 쓰기
            </Link>
          </>
        )}
        <button
          aria-label={fabOpen ? "닫기" : "만들기"}
          onClick={() => setFabOpen((v) => !v)}
          className="w-14 h-14 rounded-full bg-ink text-white shadow-[0_10px_24px_rgba(31,31,31,0.25)] flex items-center justify-center"
        >
          <Icon name={fabOpen ? "close" : "plus"} size={22} strokeWidth={2.2} />
        </button>
      </div>
      </div>

      <BottomNav />
    </Background>
  )
}

export default HomePage
