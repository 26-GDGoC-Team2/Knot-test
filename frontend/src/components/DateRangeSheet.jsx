import { useState } from "react"
import Sheet from "./Sheet"

const WEEK = ["일", "월", "화", "수", "목", "금", "토"]

// Date → "2026-11-10"
const toKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
// "2026-11-10" → Date
const fromKey = (k) => {
  const [y, m, d] = k.split("-").map(Number)
  return new Date(y, m - 1, d)
}

// "2026-11-10" → "11.10 (화)"
export function dateLabel(key) {
  if (!key) return ""
  const d = fromKey(key)
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} (${WEEK[d.getDay()]})`
}

// 두 날짜 사이 일수 (시작일·종료일 포함)
export function daysBetween(start, end) {
  return Math.round((fromKey(end) - fromKey(start)) / 86400000) + 1
}

// 진행 기간 달력 바텀시트 (REQ-011): 시작일 → 종료일 차례로 누르기
function DateRangeSheet({ start, end, onApply, onClose, title = "프로젝트 진행 기간" }) {
  const [from, setFrom] = useState(start || "")
  const [to, setTo] = useState(end || "")
  const base = from ? fromKey(from) : new Date()
  const [month, setMonth] = useState(new Date(base.getFullYear(), base.getMonth(), 1))

  const year = month.getFullYear()
  const m = month.getMonth()
  const firstDay = new Date(year, m, 1).getDay()
  const lastDate = new Date(year, m + 1, 0).getDate()
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: lastDate }, (_, i) => i + 1)]

  function pick(day) {
    const key = toKey(new Date(year, m, day))
    // 처음 누르거나, 이미 둘 다 골랐거나, 시작일보다 앞을 누르면 → 새 시작일
    if (!from || (from && to) || key < from) {
      setFrom(key)
      setTo("")
    } else {
      setTo(key)
    }
  }

  return (
    <Sheet label={title} onClose={onClose}>
      <div>
        <p className="text-[19px] font-semibold tracking-[-0.4px]">{title}</p>
        <p className="text-xs text-sub mt-1">시작일과 종료일을 차례로 눌러요</p>
      </div>

      <div className="flex items-center justify-between px-1">
        <button type="button" aria-label="이전 달" onClick={() => setMonth(new Date(year, m - 1, 1))} className="w-9 h-9 rounded-full bg-[#F1F3F4]">
          ‹
        </button>
        <span className="text-base font-semibold">
          {year}년 {m + 1}월
        </span>
        <button type="button" aria-label="다음 달" onClick={() => setMonth(new Date(year, m + 1, 1))} className="w-9 h-9 rounded-full bg-[#F1F3F4]">
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 -mt-1">
        {WEEK.map((w, i) => (
          <span key={w} className={`text-center text-[11px] ${i === 0 ? "text-[#C5221F]" : "text-sub"}`}>
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`}></span>
          const key = toKey(new Date(year, m, day))
          const isStart = key === from
          const isEnd = key === to
          const inRange = from && to && key > from && key < to
          const sunday = (firstDay + day - 1) % 7 === 0
          // 기간 배경(회색 띠): 시작일은 오른쪽 반, 종료일은 왼쪽 반만
          const band = from && to ? (isStart && from !== to ? "rounded-l-full bg-[#E8EBEF]" : isEnd && from !== to ? "rounded-r-full bg-[#E8EBEF]" : inRange ? "bg-[#E8EBEF]" : "") : ""
          return (
            <button
              key={key}
              type="button"
              onClick={() => pick(day)}
              className={`h-10 flex items-center justify-center text-sm ${band} ${sunday && !isStart && !isEnd ? "text-[#C5221F]" : ""}`}
            >
              {isStart || isEnd ? (
                <span className="w-[38px] h-[38px] rounded-full bg-ink text-white font-semibold flex items-center justify-center">{day}</span>
              ) : (
                day
              )}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-[#F6F7F9] px-3.5 py-2.5">
          <p className="text-[11px] text-sub">시작</p>
          <p className="text-[15px] font-semibold">{from ? dateLabel(from) : "—"}</p>
        </div>
        <div className="rounded-2xl bg-[#F6F7F9] px-3.5 py-2.5">
          <p className="text-[11px] text-sub">종료</p>
          <p className="text-[15px] font-semibold">{to ? dateLabel(to) : "—"}</p>
        </div>
      </div>

      <button
        type="button"
        disabled={!from || !to}
        onClick={() => {
          onApply(from, to)
          onClose()
        }}
        className="h-14 rounded-full bg-ink text-white text-[15px] font-medium disabled:bg-gray-300"
      >
        {from && to ? `${daysBetween(from, to)}일 동안 진행` : from ? "종료일을 눌러 주세요" : "시작일을 눌러 주세요"}
      </button>
    </Sheet>
  )
}

export default DateRangeSheet
