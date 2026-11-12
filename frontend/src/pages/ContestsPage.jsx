import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import Background from "../components/Background"
import BottomNav from "../components/BottomNav"
import { EmptyState } from "../components/ui"
import { fetchCompetitions } from "../lib/contest-map"
import { shortDate, today } from "../lib/helpers"

// 접수 마감까지 남은 날
function daysLeft(end) {
  return Math.ceil((new Date(end) - new Date(today())) / 86400000)
}

// 공모전 카드
function ContestCard({ c, onRecruit }) {
  const d = daysLeft(c.end)
  const closed = d < 0
  return (
    <article className={`rounded-3xl border border-white px-4 py-3.5 flex flex-col gap-2 ${closed ? "bg-white/50" : "bg-white/85"}`}>
      <div className="flex justify-between items-center">
        <span className="text-[11px] px-2 py-[3px] rounded-full bg-[#F1F3F4]">{c.category}</span>
        <span className={`text-xs font-semibold ${closed ? "text-gray-400" : d <= 7 ? "text-[#C5221F]" : "text-ink"}`}>
          {closed ? "접수 마감" : d === 0 ? "D-day" : `D-${d}`}
        </span>
      </div>
      <span className="text-base font-semibold tracking-[-0.3px] leading-[1.3]">{c.title}</span>
      <span className="text-xs text-sub">
        {/* 시작일은 없을 수 있어요 → 그땐 마감일만 */}
        {[c.host, c.start ? `접수 ${shortDate(c.start)} – ${shortDate(c.end)}` : `접수 ~ ${shortDate(c.end)}`].filter(Boolean).join(" · ")}
      </span>
      <div className="flex gap-1.5 mt-0.5">
        <a
          href={c.url}
          target="_blank"
          rel="noreferrer"
          className="h-9 px-3.5 rounded-full border border-line bg-white text-xs flex items-center"
        >
          원문 보기 ↗
        </a>
        <button
          disabled={closed}
          onClick={() => onRecruit(c)}
          className="flex-1 h-9 rounded-full bg-ink text-white text-xs disabled:bg-gray-300"
        >
          이 공모전으로 팀원 모집하기
        </button>
      </div>
    </article>
  )
}

// 공모전 탭 (REQ-033): 공모전 사이트에서 자동으로 모아 온 목록
function ContestsPage() {
  const navigate = useNavigate()
  const [category, setCategory] = useState("전체")
  const [sort, setSort] = useState("deadline") // deadline: 마감 임박순 / recent: 최신순
  const [infoOpen, setInfoOpen] = useState(false)
  const [contests, setContests] = useState(null) // 서버 공모전 목록 (null = 불러오는 중)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchCompetitions()
      .then(setContests)
      .catch(() => {
        setContests([])
        setFailed(true)
      })
  }, [])

  // 필터 탭: 받아 온 공모전들의 카테고리 (위비티 분류 그대로, 가나다순)
  const categories = [...new Set((contests ?? []).map((c) => c.category))].sort((a, b) => a.localeCompare(b, "ko"))

  const list = (contests ?? [])
    .filter((c) => category === "전체" || c.category === category)
    .sort((a, b) => {
      // 마감된 공모전은 항상 맨 아래
      const ac = daysLeft(a.end) < 0, bc = daysLeft(b.end) < 0
      if (ac !== bc) return ac ? 1 : -1
      // 최신순: 접수 시작일이 늦은 순 (시작일이 없으면 뒤로)
      return sort === "deadline" ? a.end.localeCompare(b.end) : (b.start || "").localeCompare(a.start || "")
    })

  const chip = (on) =>
    `h-[34px] px-[13px] rounded-full text-xs whitespace-nowrap ${on ? "bg-ink text-white" : "bg-white/70 border border-white text-sub"}`

  return (
    <Background plain>
      <header className="relative flex items-center gap-0.5">
        <h1 className="text-[26px] font-semibold tracking-[-0.5px]">공모전</h1>
        <button
          aria-label="공모전 정보 안내"
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen((v) => !v)}
          className={`w-6 h-6 rounded-full flex items-center justify-center ${infoOpen ? "text-ink" : "text-[#9AA0A6]"}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 7.5v.5" />
          </svg>
        </button>

        {/* ⓘ 안내 말풍선 */}
        {infoOpen && (
          <div
            role="tooltip"
            className="absolute left-0 top-[42px] z-30 w-[300px] rounded-[18px] bg-ink text-white px-4 py-3.5 shadow-[0_16px_36px_rgba(31,31,31,0.22)] flex flex-col gap-2 fade-in"
          >
            <span aria-hidden="true" className="absolute -top-1.5 left-[84px] w-3 h-3 bg-ink rotate-45 rounded-[2px]"></span>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">공모전은 이렇게 모아요</span>
              <button aria-label="안내 닫기" onClick={() => setInfoOpen(false)} className="text-base text-[#9AA0A6] leading-none">
                ×
              </button>
            </div>
            <p className="text-xs leading-relaxed text-[#D5D8DC] break-keep">
              공모전 사이트(위비티)에서 <b className="text-white font-semibold">매주 월요일 새벽</b>에 자동으로 모아 와요.
              접수 기간·자격 등 자세한 내용은 <b className="text-white font-semibold">원문 보기</b>에서 확인해 주세요.
            </p>
          </div>
        )}
      </header>

      <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
        {["전체", ...categories].map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={chip(category === c)}>
            {c}
          </button>
        ))}
        {/* 정렬 */}
        <label className={`${chip(false)} relative flex items-center gap-1`}>
          {sort === "deadline" ? "마감 임박순" : "최신순"} ▾
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="정렬"
            className="absolute inset-0 opacity-0 cursor-pointer"
          >
            <option value="deadline">마감 임박순</option>
            <option value="recent">최신순</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {contests === null ? (
          <p className="py-10 text-center text-sm text-sub">불러오는 중…</p>
        ) : failed ? (
          <EmptyState title="공모전 정보를 불러오지 못했어요" desc="잠시 후 다시 들어와 주세요." />
        ) : list.length === 0 ? (
          <EmptyState title="이 분야의 공모전이 아직 없어요" desc="매주 월요일 새벽에 새로 모아 와요." />
        ) : (
          list.map((c) => (
            <ContestCard key={c.id} c={c} onRecruit={(contest) => navigate("/posts/new", { state: { contest } })} />
          ))
        )}
      </div>

      <BottomNav />
    </Background>
  )
}

export default ContestsPage
