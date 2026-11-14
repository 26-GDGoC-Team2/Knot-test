import { useState } from "react"
import { roleDot } from "../lib/helpers"

// 여러 개 고르는 칩 목록 (역할·기술·관심 분야 선택)
// searchable이면 검색창 + 목록에 없는 값 추가 가능
// 기술처럼 목록이 긴 경우: 처음 12개(+고른 것)만 보이고 [전체 보기 (N)]로 펼쳐요 (아카이브 필터와 같은 방식)
const FIRST = 12
function SelectChips({ options, value, onChange, searchable = false, showRoleDot = false, single = false }) {
  const [query, setQuery] = useState("")
  const [showAll, setShowAll] = useState(false)

  const allOptions = [...new Set([...options, ...value])]
  const folded = searchable && !query && !showAll && allOptions.length > FIRST
  const filtered = query
    ? allOptions.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : folded
      ? [...new Set([...value, ...options.slice(0, FIRST)])]
      : allOptions
  const canAdd = query.trim() && !allOptions.some((o) => o.toLowerCase() === query.trim().toLowerCase())

  function toggle(option) {
    if (single) {
      onChange(value.includes(option) ? [] : [option])
      return
    }
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option])
  }

  function addCustom() {
    onChange([...value, query.trim()])
    setQuery("")
  }

  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="기술 검색 (예: Spring)"
            className="flex-1 h-10 rounded-full bg-black/[0.04] px-4 text-sm outline-none" /* 흰 시트 위·회색 화면 위 어디서나 보이게 살짝 어두운 바탕 */
          />
          {canAdd && (
            <button type="button" onClick={addCustom} className="h-10 px-4 rounded-full bg-ink text-white text-sm whitespace-nowrap">
              + 추가
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {filtered.map((option) => {
          const selected = value.includes(option)
          return (
            <button
              type="button"
              key={option}
              onClick={() => toggle(option)}
              aria-pressed={selected}
              className={`h-10 px-4 rounded-full text-sm inline-flex items-center gap-1.5 border transition-colors ${
                selected ? "bg-ink text-white border-ink" : "bg-white text-ink border-line"
              }`}
            >
              {showRoleDot && roleDot[option] && (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${roleDot[option]}`}></span>
              )}
              {option}
            </button>
          )
        })}
        {searchable && !query && allOptions.length > FIRST && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="h-10 px-1 text-[13px] text-sub underline underline-offset-2"
          >
            {showAll ? "접기" : `전체 보기 (${allOptions.length})`}
          </button>
        )}
      </div>
    </div>
  )
}

export default SelectChips
