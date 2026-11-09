import { useState } from "react"
import Sheet from "./Sheet"
import { Toggle } from "./ui"
import { ROLES, SKILLS, INTERESTS } from "../data"

// 빈 필터 (초기화할 때 사용)
export const EMPTY_FILTER = { onlyOpen: true, roles: [], skills: [], interests: [] }

// 관심 분야 값 → 짧게 보여 줄 이름 (홈 화면의 적용된 필터 칩에서 사용)
export const INTEREST_OPTIONS = [
  { value: "AI/ML", label: "AI/ML" },
  { value: "UX/UI", label: "UX/UI" },
  { value: "금융/핀테크", label: "핀테크" },
  { value: "교육", label: "교육" },
  { value: "커머스", label: "커머스" },
]

// 옵션은 "React" 같은 글자 또는 { value, label } 둘 다 가능
const valueOf = (o) => (typeof o === "string" ? o : o.value)
const labelOf = (o) => (typeof o === "string" ? o : o.label)

// 선택 칩 한 묶음 (여러 개 고를 수 있음). children은 칩 뒤에 붙는 추가 버튼
function ChipGroup({ title, options, selected, onToggle, children }) {
  return (
    <div className="flex flex-col gap-2">
      {title && <span className="text-[13px] font-semibold">{title}</span>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const v = valueOf(o)
          const on = selected.includes(v)
          return (
            <button
              key={v}
              aria-pressed={on}
              onClick={() => onToggle(v)}
              className={`h-[38px] px-4 rounded-full text-[13px] ${on ? "bg-ink text-white" : "border border-line"}`}
            >
              {labelOf(o)}
            </button>
          )
        })}
        {children}
      </div>
    </div>
  )
}

// 기술: 검색칸 + 처음 12개 + [전체 보기] (아카이브 필터와 같은 방식, 고른 기술은 항상 보여요)
const SKILL_FIRST = 12
function SkillGroup({ selected, onToggle }) {
  const [q, setQ] = useState("")
  const [showAll, setShowAll] = useState(false)
  const searched = SKILLS.filter((s) => s.toLowerCase().includes(q.trim().toLowerCase()))
  const options = q.trim() || showAll ? searched : [...new Set([...selected, ...SKILLS.slice(0, SKILL_FIRST)])]

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">기술</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="기술 검색 (예: Spring)"
        aria-label="기술 검색"
        className="h-10 rounded-full bg-[#F6F7F9] px-4 text-sm outline-none"
      />
      <ChipGroup options={options} selected={selected} onToggle={onToggle}>
        {options.length === 0 && <span className="text-xs text-sub self-center">맞는 기술이 없어요</span>}
        {!q.trim() && SKILLS.length > SKILL_FIRST && (
          <MoreButton open={showAll} total={SKILLS.length} onClick={() => setShowAll((v) => !v)} />
        )}
      </ChipGroup>
    </div>
  )
}

// 관심 분야: 처음 6개 + [전체 보기] (개수가 적어서 검색칸 없이 펼치기만)
const INTEREST_FIRST = 6
function InterestGroup({ selected, onToggle }) {
  const [showAll, setShowAll] = useState(false)
  const options = showAll ? INTERESTS : [...new Set([...selected, ...INTERESTS.slice(0, INTEREST_FIRST)])]
  return (
    <ChipGroup title="관심 분야" options={options} selected={selected} onToggle={onToggle}>
      {INTERESTS.length > INTEREST_FIRST && (
        <MoreButton open={showAll} total={INTERESTS.length} onClick={() => setShowAll((v) => !v)} />
      )}
    </ChipGroup>
  )
}

// [전체 보기 (N)] / [접기]
function MoreButton({ open, total, onClick }) {
  return (
    <button onClick={onClick} className="h-[38px] px-1 text-[13px] text-sub underline underline-offset-2">
      {open ? "접기" : `전체 보기 (${total})`}
    </button>
  )
}

// 모집글 필터 바텀시트 (REQ-009)
// value: 지금 적용된 필터 / countFor(필터): 그 필터로 보이는 개수 / onApply: 적용
// mode="members"면 부원 탭의 "기술·관심" 시트 (모집 중만·역할 없이 기술·관심 분야만)
function FilterSheet({ value, countFor, onApply, onClose, mode = "posts" }) {
  // 시트 안에서 고르는 동안은 임시로 들고 있다가 "보기"를 누르면 적용
  const [draft, setDraft] = useState(value)
  const isPosts = mode === "posts"

  const toggle = (key) => (item) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(item) ? d[key].filter((x) => x !== item) : [...d[key], item],
    }))

  return (
    <Sheet label={isPosts ? "필터" : "기술·관심 필터"} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-medium">{isPosts ? "필터" : "기술·관심"}</h2>
        {isPosts && (
          <label className="flex items-center gap-2 text-sm">
            모집 중만
            <Toggle
              checked={draft.onlyOpen}
              onChange={(v) => setDraft((d) => ({ ...d, onlyOpen: v }))}
              label="모집 중인 글만 보기"
            />
          </label>
        )}
      </div>

      {isPosts && <ChipGroup title="역할" options={ROLES} selected={draft.roles} onToggle={toggle("roles")} />}
      <SkillGroup selected={draft.skills} onToggle={toggle("skills")} />
      <InterestGroup selected={draft.interests} onToggle={toggle("interests")} />

      <div className="flex gap-2 mt-1">
        <button
          onClick={() => setDraft(isPosts ? EMPTY_FILTER : { ...draft, skills: [], interests: [] })}
          className="flex-1 h-14 rounded-full border border-line bg-white text-[15px]"
        >
          초기화
        </button>
        <button
          onClick={() => {
            onApply(draft)
            onClose()
          }}
          className="flex-[2] h-14 rounded-full bg-ink text-white text-[15px] font-medium"
        >
          {isPosts ? "모집글" : "부원"} {countFor(draft)}
          {isPosts ? "개" : "명"} 보기
        </button>
      </div>
    </Sheet>
  )
}

export default FilterSheet
