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

// 탭 이동 애니메이션 시간 (너무 빠르지 않게)
const DURATION = "duration-500"
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]"

// 탭마다 화면이 새로 그려져서, 직전에 보던 탭을 기억해 두고 거기서부터 미끄러지게 해요
let lastIndex = null

function activeIndexOf(pathname) {
  return tabs.findIndex((t) => (t.end ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/")))
}

function NavItem({ tab, badge, active, itemRef }) {
  return (
    <NavLink
      ref={itemRef}
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
      {/* 탭 이름: 선택되면 서서히 펼쳐지며 나타나요 */}
      <span
        // 줄바꿈 금지: 전체 글자 줄바꿈 설정(index.css) 때문에 접히는 동안 글자가 세로로 쌓여 위로 튀어 보였어요
        style={{ whiteSpace: "nowrap", textWrap: "nowrap" }}
        className={`overflow-hidden transition-all ${DURATION} ${EASE} motion-reduce:transition-none ${
          active ? "max-w-20 ml-2 opacity-100" : "max-w-0 ml-0 opacity-0"
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
  const [pill, setPill] = useState(null) // 검은 캡슐의 위치·너비
  const [ready, setReady] = useState(false) // 첫 위치는 애니메이션 없이 바로 놓기
  const itemRefs = useRef([])

  useEffect(() => {
    lastIndex = current
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(current)))
    return () => cancelAnimationFrame(id)
  }, [current])

  // 선택된 탭의 크기가 바뀌는 동안 계속 따라가며 캡슐 위치를 맞춰요
  useLayoutEffect(() => {
    const el = itemRefs.current[shown]
    if (!el) {
      setPill(null)
      return
    }
    const measure = () => setPill({ left: el.offsetLeft, width: el.offsetWidth })
    measure()
    const ro = new ResizeObserver(measure)
    itemRefs.current.forEach((n) => n && ro.observe(n))
    return () => ro.disconnect()
  }, [shown])

  useEffect(() => {
    if (pill && !ready) {
      const id = requestAnimationFrame(() => setReady(true))
      return () => cancelAnimationFrame(id)
    }
  }, [pill, ready])

  return (
    <nav className="fixed left-0 right-0 bottom-0 z-40 pb-5 px-5 pointer-events-none">
      <div className="pointer-events-auto relative max-w-md mx-auto h-16 rounded-full glass shadow-[0_12px_30px_rgba(31,31,31,0.12)] flex items-center justify-between px-2">
        {/* 검은 캡슐: 누른 탭 쪽으로 옆으로 미끄러져 가요 */}
        <span
          aria-hidden="true"
          className={`absolute top-2 h-12 rounded-full bg-ink ${
            ready ? `transition-[left,width] ${DURATION} ${EASE}` : ""
          } motion-reduce:transition-none ${pill ? "opacity-100" : "opacity-0"}`}
          style={pill ? { left: pill.left, width: pill.width } : undefined}
        ></span>
        {tabs.map((tab, i) => (
          <NavItem
            key={tab.to}
            tab={tab}
            badge={tab.to === "/activity" ? pendingForMe : 0}
            active={shown === i}
            itemRef={(n) => (itemRefs.current[i] = n)}
          />
        ))}
      </div>
    </nav>
  )
}

export default BottomNav
