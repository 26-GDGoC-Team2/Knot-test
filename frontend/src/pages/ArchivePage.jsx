import { useState } from "react"
import { Link } from "react-router-dom"
import Background from "../components/Background"
import Sheet from "../components/Sheet"
import BottomNav from "../components/BottomNav"
import Icon from "../components/Icon"
import { EmptyState } from "../components/ui"
import { useStore } from "../lib/store-context"
import { ARCHIVE_TYPES, GENERATIONS, SKILLS } from "../data"
import { periodText, archiveMemberName } from "../lib/archive"

// 검색어가 제목·기술·설명에 들어 있는지
function matchesQuery(a, q) {
  if (!q) return true
  return [a.title, a.description, ...a.skills].join(" ").toLowerCase().includes(q.toLowerCase())
}

// 아카이브 목록 카드
function ArchiveCard({ archive, user }) {
  const names = archive.members.map((m) => archiveMemberName(user, m) + (m.external ? "(외부)" : ""))
  const shown = names.length > 3 ? `${names.slice(0, 3).join(" · ")} 외 ${names.length - 3}` : names.join(" · ")
  const gdgoc = archive.type === "gdgoc"
  return (
    <Link to={`/archive/${archive.id}`} className="block">
      <article className="rounded-3xl bg-white/85 border border-white px-4 py-3.5 flex flex-col gap-1.5 active:scale-[0.99] transition-transform">
        <div className="flex justify-between items-center">
          <span
            className={`text-[10px] font-medium px-2 py-[3px] rounded-full ${
              gdgoc ? "bg-ink text-white" : "bg-white border border-[#DADCE0]"
            }`}
          >
            {ARCHIVE_TYPES[archive.type]}
          </span>
          <span className="text-[11px] text-sub">
            {[archive.gen, periodText(archive.start, archive.end)].filter(Boolean).join(" · ")}
          </span>
        </div>
        <span className="text-base font-semibold tracking-[-0.3px]">{archive.title}</span>
        <span className="text-xs text-sub truncate">{shown}</span>
        <span className="text-xs text-[#3C4043]">{archive.skills.join(" · ")}</span>
      </article>
    </Link>
  )
}

const EMPTY_ARCHIVE_FILTER = { type: "all", gen: "", skills: [] }

// 필터 바텀시트: 구분 · 기수 · 기술을 한 번에 고르고 [적용]
function ArchiveFilterSheet({ initial, skillOptions, count, onApply, onClose }) {
  const [draft, setDraft] = useState(initial)
  const [skillQuery, setSkillQuery] = useState("")
  const [showAll, setShowAll] = useState(false)
  // 검색하면 맞는 기술만, 아니면 처음 12개 + [전체 보기] (고른 기술은 항상 보여요)
  const searched = skillOptions.filter((sk) => sk.toLowerCase().includes(skillQuery.trim().toLowerCase()))
  const visibleSkills = skillQuery.trim() || showAll
    ? searched
    : [...new Set([...draft.skills, ...skillOptions.slice(0, 12)])]
  const pill = (on) =>
    `h-9 px-3.5 rounded-full text-[13px] ${on ? "bg-ink text-white" : "bg-[#F1F3F4] text-[#3C4043]"}`
  const toggleSkill = (sk) =>
    setDraft((d) => ({ ...d, skills: d.skills.includes(sk) ? d.skills.filter((x) => x !== sk) : [...d.skills, sk] }))

  return (
    <Sheet label="아카이브 필터" onClose={onClose}>
      <div className="flex items-center justify-between">
        <span className="text-[19px] font-semibold tracking-[-0.4px]">필터</span>
        <button onClick={() => setDraft(EMPTY_ARCHIVE_FILTER)} className="text-[13px] text-sub underline underline-offset-2">
          초기화
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">구분</span>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { v: "all", label: "전체" },
            { v: "gdgoc", label: ARCHIVE_TYPES.gdgoc },
            { v: "external", label: ARCHIVE_TYPES.external },
          ].map((t) => (
            <button key={t.v} onClick={() => setDraft((d) => ({ ...d, type: t.v }))} className={pill(draft.type === t.v)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">기수</span>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setDraft((d) => ({ ...d, gen: "" }))} className={pill(!draft.gen)}>
            전체
          </button>
          {GENERATIONS.map((g) => (
            <button key={g} onClick={() => setDraft((d) => ({ ...d, gen: g }))} className={pill(draft.gen === g)}>
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">
          기술 <span className="text-xs text-sub font-normal">여러 개 고를 수 있어요</span>
        </span>
        <input
          value={skillQuery}
          onChange={(e) => setSkillQuery(e.target.value)}
          placeholder="기술 검색 (예: Spring)"
          aria-label="기술 검색"
          className="h-10 rounded-full bg-[#F6F7F9] px-4 text-sm outline-none"
        />
        <div className="flex gap-1.5 flex-wrap">
          {visibleSkills.map((sk) => (
            <button key={sk} onClick={() => toggleSkill(sk)} className={pill(draft.skills.includes(sk))}>
              {sk}
            </button>
          ))}
          {visibleSkills.length === 0 && <span className="text-xs text-sub">맞는 기술이 없어요</span>}
          {!skillQuery.trim() && skillOptions.length > 12 && (
            <button onClick={() => setShowAll((v) => !v)} className="h-9 px-3.5 rounded-full text-[13px] text-sub underline underline-offset-2">
              {showAll ? "접기" : `전체 보기 (${skillOptions.length})`}
            </button>
          )}
        </div>
      </div>

      <button
        onClick={() => {
          onApply(draft)
          onClose()
        }}
        className="h-14 rounded-full bg-ink text-white text-[15px] font-medium"
      >
        {count(draft)}개 프로젝트 보기
      </button>
    </Sheet>
  )
}

// 아카이브 탭 (REQ-030): 이전 프로젝트를 참고하는 곳
function ArchivePage() {
  const { user, archives, archivesFailed } = useStore()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState(EMPTY_ARCHIVE_FILTER) // 구분 · 기수 · 기술
  const [filterOpen, setFilterOpen] = useState(false)

  // 기술 목록: 정해 둔 기본 목록만 (직접 입력한 기술은 오타가 섞일 수 있어서 필터에선 빼고, 위 검색창으로 찾아요)
  const skillOptions = SKILLS

  // 기술은 고른 것 중 하나라도 쓰였으면 보여요
  const applyFilter = (f) =>
    archives
      .filter((a) => f.type === "all" || a.type === f.type)
      .filter((a) => !f.gen || a.gen === f.gen)
      .filter((a) => f.skills.length === 0 || f.skills.some((sk) => a.skills.includes(sk)))
      .filter((a) => matchesQuery(a, query))
  const list = applyFilter(filter)
  const filterCount = (filter.type !== "all" ? 1 : 0) + (filter.gen ? 1 : 0) + filter.skills.length

  const appliedChip = "h-8 px-3 rounded-full bg-white/75 border border-white text-xs inline-flex items-center gap-1.5"

  return (
    <Background plain>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.5px]">아카이브</h1>
          <p className="text-xs text-sub mt-0.5">이전 프로젝트를 참고해요</p>
        </div>
        <Link to="/archive/new" className="h-10 px-3.5 rounded-full bg-ink text-white text-[13px] font-medium flex items-center">
          + 우리 팀 등록
        </Link>
      </header>

      {/* 검색 + 필터 버튼 */}
      <div className="mt-3.5 flex gap-2">
        <label className="flex-1 h-[46px] rounded-full bg-white/80 border border-white flex items-center gap-2 px-4 text-sub">
          <Icon name="search" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="프로젝트, 기술 검색"
            aria-label="아카이브 검색"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-ink"
          />
        </label>
        <button
          onClick={() => setFilterOpen(true)}
          aria-label={`필터 ${filterCount}개 적용됨`}
          className="h-[46px] px-3.5 rounded-full bg-ink text-white text-[13px] flex items-center gap-1.5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="10" cy="17" r="2" />
          </svg>
          {filterCount}
        </button>
      </div>

      {/* 적용된 필터 (누르면 빠져요) + 개수 */}
      <div className="mt-2.5 flex gap-1.5 flex-wrap items-center">
        {filter.type !== "all" && (
          <button onClick={() => setFilter((f) => ({ ...f, type: "all" }))} className={appliedChip}>
            {ARCHIVE_TYPES[filter.type]} <span aria-hidden="true" className="text-sub">×</span>
          </button>
        )}
        {filter.gen && (
          <button onClick={() => setFilter((f) => ({ ...f, gen: "" }))} className={appliedChip}>
            {filter.gen} <span aria-hidden="true" className="text-sub">×</span>
          </button>
        )}
        {filter.skills.map((sk) => (
          <button key={sk} onClick={() => setFilter((f) => ({ ...f, skills: f.skills.filter((x) => x !== sk) }))} className={appliedChip}>
            {sk} <span aria-hidden="true" className="text-sub">×</span>
          </button>
        ))}
        <span className="text-xs text-sub">{list.length}개</span>
      </div>

      <div className="mt-2.5 flex flex-col gap-2.5">
        {archivesFailed && archives.length === 0 ? (
          // 서버에서 못 받아 온 경우 (진짜 0개와 구분해요)
          <EmptyState title="아카이브를 불러오지 못했어요" desc="잠시 후 다시 들어와 주세요." />
        ) : list.length === 0 ? (
          <EmptyState
            title="조건에 맞는 프로젝트가 없어요"
            desc="검색어나 필터를 바꿔 보거나, 우리 팀 프로젝트를 먼저 등록해 보세요."
          />
        ) : (
          list.map((a) => <ArchiveCard key={a.id} archive={a} user={user} />)
        )}
      </div>

      {filterOpen && (
        <ArchiveFilterSheet
          initial={filter}
          skillOptions={skillOptions}
          count={(f) => applyFilter(f).length}
          onApply={setFilter}
          onClose={() => setFilterOpen(false)}
        />
      )}
      <BottomNav />
    </Background>
  )
}

export default ArchivePage
