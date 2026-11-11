// 자주 쓰는 작은 UI 조각들
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import Icon from "./Icon"
import { roleDot } from "../lib/helpers"

// 동그란 유리 아이콘 버튼
export function CircleButton({ icon, label, onClick, dark = false, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`relative w-11 h-11 shrink-0 rounded-full flex items-center justify-center ${
        dark ? "bg-ink text-white" : "glass text-ink"
      }`}
    >
      <Icon name={icon} size={19} />
      {children}
    </button>
  )
}

// 상단 바: 뒤로 가기 + 제목 + 오른쪽 영역
export function TopBar({ title, right, onBack }) {
  const navigate = useNavigate()
  return (
    // 3칸 나눔(왼쪽 · 가운데 · 오른쪽): 양쪽 칸 너비가 같아서 오른쪽 버튼이 넓어도 제목은 화면 가운데
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-5">
      <div className="flex justify-start">
        <CircleButton icon="back" label="뒤로" onClick={onBack ?? (() => navigate(-1))} />
      </div>
      <span className="text-base font-semibold truncate">{title}</span>
      <div className="min-w-11 flex justify-end">{right}</div>
    </header>
  )
}

// 역할 칩 (색 점 포함)
// plain: 바탕·여백 없이 점 + 글자만 (이름 아래 역할처럼 위 글자와 왼쪽 선을 맞출 때)
export function RoleChip({ role, count, plain = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${plain ? "" : "bg-white px-3 py-1.5 rounded-full"}`}>
      <span className={`${plain ? "ml-[1.5px]" : ""} w-1.5 h-1.5 shrink-0 rounded-full ${roleDot[role] ?? "bg-gray-400"}`}></span>
      {role}
      {count !== undefined && ` ${count}`}
    </span>
  )
}

// 일반 칩
export function Chip({ children, variant = "white" }) {
  const styles = {
    white: "bg-white text-ink",
    outline: "border border-gray-300 text-gray-700",
    soft: "bg-black/5 text-gray-700",
    dark: "bg-ink text-white",
    success: "bg-[#E6F4EA] text-[#137333]", // 수락함 같은 좋은 상태 (GDGoC 초록)
  }
  return (
    <span className={`inline-flex items-center text-xs font-medium px-3 py-1.5 rounded-full ${styles[variant]}`}>
      {children}
    </span>
  )
}

// 모집 상태 표시
export function StatusText({ open }) {
  return (
    <span className={`text-xs font-medium inline-flex items-center gap-1.5 ${open ? "text-[#137333]" : "text-gray-400"}`}>
      <span className="ml-[1.5px] w-1.5 h-1.5 shrink-0 rounded-full bg-current"></span>
      {open ? "모집 중" : "모집 완료"}
    </span>
  )
}

// 이름 첫 글자 아바타
export function Avatar({ name = "?", size = 44, ring = false }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={`shrink-0 rounded-full bg-[#EDEFF2] text-ink font-semibold flex items-center justify-center ${
        ring ? "ring-2 ring-ink ring-offset-2" : ""
      }`}
    >
      {name.slice(0, 1) || "?"}
    </span>
  )
}

// 수료 배지 (운영진이 지정한 수료 기수)
// - 없으면: 안 보임 (showEmpty면 "수료 전")
// - 1개: "6기 수료"
// - 여러 개: "7기 수료 +2 ▾" 버튼 → 누르면 수료한 기수가 모두 펼쳐져요
export function CompletedBadge({ gens = [], showEmpty = false, className = "" }) {
  const [open, setOpen] = useState(false)
  const nums = gens
    .map((g) => parseInt(g, 10))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b)
  const base = `inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-black/5 text-gray-700 whitespace-nowrap ${className}`

  if (nums.length === 0) return showEmpty ? <span className={base}>수료 전</span> : null
  if (nums.length === 1) return <span className={base}>{nums[0]}기 수료</span>

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "수료 기수 접기" : `수료 기수 ${nums.length}개 펼치기`}
        onClick={(e) => {
          // 카드 전체가 링크여도 펼치기만 하고 이동하지 않게
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={base}
      >
        {nums[nums.length - 1]}기 수료
        <span className="text-sub">+{nums.length - 1}</span>
        <Icon name="next" size={11} className={`transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <span className="flex gap-1 flex-wrap fade-in">
          {[...nums].reverse().map((n) => (
            <span key={n} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-line text-gray-700">
              {n}기 수료
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

// 큰 검은 버튼
export function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`h-14 rounded-full bg-ink text-white font-medium disabled:bg-gray-300 ${className}`}
    >
      {children}
    </button>
  )
}

// 흰 테두리 버튼
export function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`h-14 rounded-full bg-white border border-line text-ink font-medium disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

// 탭 (가로 칩 형태)
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`h-10 px-4 rounded-full text-sm whitespace-nowrap ${
            value === t.value ? "bg-ink text-white font-medium" : "glass text-ink"
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1 opacity-70">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// 켜기/끄기 스위치
// small: 카드 안 작은 줄에 쓰는 작은 스위치 (프로젝트 경험 공개 여부 등)
export function Toggle({ checked, onChange, label, small = false }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`${small ? "w-9 h-5 p-0.5" : "w-13 h-8 p-1"} shrink-0 rounded-full flex transition-colors ${
        checked ? "bg-ink justify-end" : "bg-gray-300 justify-start"
      }`}
    >
      <span className={`${small ? "w-4 h-4" : "w-6 h-6"} rounded-full bg-white`}></span>
    </button>
  )
}

// 비어 있을 때
export function EmptyState({ title, desc, action }) {
  return (
    <div className="glass rounded-[28px] p-8 flex flex-col items-center text-center gap-2">
      <p className="font-medium">{title}</p>
      {desc && <p className="text-sm text-sub">{desc}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

// 섹션 제목
export function SectionTitle({ children, right }) {
  return (
    <div className="flex items-baseline justify-between mt-6 mb-3">
      <h2 className="text-base font-semibold">{children}</h2>
      {right}
    </div>
  )
}

// GDGoC 로고 점
export function LogoDots({ size = 9 }) {
  const colors = ["bg-g-blue", "bg-g-red", "bg-g-yellow", "bg-g-green"]
  return (
    <span className="flex gap-1" aria-hidden="true">
      {colors.map((c) => (
        <span key={c} style={{ width: size, height: size }} className={`rounded-full ${c}`}></span>
      ))}
    </span>
  )
}

// 프로젝트 종류별 배지 (REQ-007)
export function ProjectBadge({ type }) {
  const style = type === "동아리 프로젝트" ? "bg-ink text-white" : type === "동아리원 팀" ? "bg-white text-ink border border-[#DADCE0]" /* 흰 카드 위에서도 보이게 테두리 */ : "bg-black/5 text-gray-700"
  return <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${style}`}>{type}</span>
}
