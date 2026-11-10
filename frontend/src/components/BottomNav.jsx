import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import Icon from "./Icon"
import { useStore } from "../lib/store-context"
import { ME } from "../data"

// 하단 탭 5개: 홈 · 아카이브 · 공모전 · 내역 · 마이
const tabs = [
  { to: "/", icon: "home", label: "홈", end: true },
  { to: "/archive", icon: "archive", label: "아카이브" },
  { to: "/contests", icon: "trophy", label: "공모전" },
  // 비행기 아이콘은 그림이 상자를 꽉 채워서 다른 아이콘보다 커 보여요 → 조금 작게 (눈으로 보이는 크기를 맞춤)
  { to: "/activity", icon: "send", label: "내역", size: 17 },
  { to: "/me", icon: "user", label: "마이" },
]

// 탭 이동 애니메이션 (캡슐 · 탭 너비가 같은 시간 · 같은 속도로 움직여서 함께 도착해요)
const DURATION = "duration-[420ms]"
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]"

// 크기 (Tailwind 값과 같게): 바깥 여백 px-2 = 8 / 안 고른 탭 48 / 고른 탭 = 16 + 아이콘 + 8 + 글자 + 16
const PAD = 8
const IDLE_W = 48

// 탭마다 화면이 새로 그려져서, 직전에 보던 탭을 기억해 두고 거기서부터 미끄러지게 해요
let lastIndex = null

function activeIndexOf(pathname) {
  return tabs.findIndex((t) => (t.end ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/")))
}

function NavItem({ tab, badge, active }) {
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      aria-label={tab.label}
      className={`relative z-10 h-12 min-w-12 rounded-full flex items-center justify-center text-sm font-medium transition-[color,padding] ${DURATION} ${EASE} motion-reduce:transition-none ${
        active ? "text-white px-4" : "text-sub px-[14.5px]"
      }`}
    >
      {/* 알림 점 (피그마와 같게): 빨강 6px + 바깥 흰 테두리 1px, 비행기 끝 꼭짓점 위 */}
      <span className="relative flex">
        <Icon name={tab.icon} size={tab.size ?? 19} />
        {badge > 0 && !active && (
          <span className="absolute left-[11.6px] top-[-2.6px] w-[8px] h-[8px] rounded-full bg-g-red border border-white"></span>
        )}
      </span>
      {/* 탭 이름: 늘 흰색 (캡슐 밖에서 회색 글자가 비쳐 보이지 않게)
          - 고를 때: 캡슐이 거의 도착한 뒤에 나타나요 (opacity 지연)
          - 떠날 때: 바로 사라져요 */}
      <span
        // 줄바꿈 금지: 전체 글자 줄바꿈 설정(index.css) 때문에 접히는 동안 글자가 세로로 쌓여 위로 튀어 보였어요
        style={{ whiteSpace: "nowrap", textWrap: "nowrap" }}
        className={`overflow-hidden text-white transition-[max-width,margin,opacity] ${DURATION} ${EASE} motion-reduce:transition-none ${
          active ? "max-w-20 ml-2 opacity-100 [transition-delay:0ms,0ms,180ms]" : "max-w-0 ml-0 opacity-0 [transition-duration:420ms,420ms,120ms]"
        }`}
      >
        {tab.label}
      </span>
    </NavLink>
  )
}

function BottomNav() {
  const { applications } = useStore()
  const pendingForMe = applications.filter((a) => a.toId === ME && a.status === "pending").length
  const { pathname } = useLocation()
  const current = activeIndexOf(pathname)

  // 처음엔 직전 탭에 캡슐을 두고, 한 박자 뒤에 지금 탭으로 미끄러져 가요
  const [shown, setShown] = useState(() => (lastIndex != null && lastIndex !== -1 ? lastIndex : current))
  const [ready, setReady] = useState(false) // 첫 위치는 애니메이션 없이 바로 놓기
  const [size, setSize] = useState(null) // { bar: 바 너비, labels: 탭 이름 글자 너비들 }
  const barRef = useRef(null)
  const measureRefs = useRef([])

  useEffect(() => {
    lastIndex = current
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(current)))
    return () => cancelAnimationFrame(id)
  }, [current])

  // 바 너비와 탭 이름 글자 너비를 재 둬요 (화면 크기가 바뀌면 다시)
  useLayoutEffect(() => {
    const measure = () =>
      setSize({
        bar: barRef.current?.clientWidth ?? 0,
        labels: measureRefs.current.map((n) => n?.offsetWidth ?? 0),
      })
    measure()
    const ro = new ResizeObserver(measure)
    if (barRef.current) ro.observe(barRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (size && !ready) {
      const id = requestAnimationFrame(() => setReady(true))
      return () => cancelAnimationFrame(id)
    }
  }, [size, ready])

  // 캡슐의 '도착 위치'를 계산해서 그곳으로 한 번에 움직여요
  // (예전엔 움직이는 탭을 매 순간 따라가느라 캡슐이 늦게 쫓아가며 글자가 캡슐 밖으로 비쳐 보였어요)
  let pill = null
  if (size && shown >= 0) {
    const widths = tabs.map((t, i) => (i === shown ? 16 + (t.size ?? 19) + 8 + size.labels[i] + 16 : IDLE_W))
    const gap = (size.bar - PAD * 2 - widths.reduce((a, b) => a + b, 0)) / (tabs.length - 1)
    const left = PAD + widths.slice(0, shown).reduce((a, b) => a + b, 0) + gap * shown
    pill = { left, width: widths[shown] }
  }

  return (
    <nav className="fixed left-0 right-0 bottom-0 z-40 pb-5 px-5 pointer-events-none">
      <div
        ref={barRef}
        className="pointer-events-auto relative max-w-md mx-auto h-16 rounded-full glass shadow-[0_12px_30px_rgba(31,31,31,0.12)] flex items-center justify-between px-2"
      >
        {/* 글자 너비 재기용 (화면엔 안 보여요) */}
        <span aria-hidden="true" className="absolute invisible pointer-events-none text-sm font-medium" style={{ whiteSpace: "nowrap" }}>
          {tabs.map((t, i) => (
            <span key={t.to} ref={(n) => (measureRefs.current[i] = n)} className="inline-block">
              {t.label}
            </span>
          ))}
        </span>
        {/* 검은 캡슐: 누른 탭 쪽으로 옆으로 미끄러져 가요 */}
        <span
          aria-hidden="true"
          className={`absolute top-2 h-12 rounded-full bg-ink ${
            ready ? `transition-[left,width] ${DURATION} ${EASE}` : ""
          } motion-reduce:transition-none ${pill ? "opacity-100" : "opacity-0"}`}
          style={pill ? { left: pill.left, width: pill.width } : undefined}
        ></span>
        {tabs.map((tab, i) => (
          <NavItem key={tab.to} tab={tab} badge={tab.to === "/activity" ? pendingForMe : 0} active={shown === i} />
        ))}
      </div>
    </nav>
  )
}

export default BottomNav
