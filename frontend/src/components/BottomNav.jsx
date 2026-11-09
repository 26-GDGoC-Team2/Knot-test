import { NavLink } from "react-router-dom"
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

function NavItem({ tab, badge }) {
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      aria-label={tab.label}
      className={({ isActive }) =>
        `relative h-12 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-all ${
          isActive ? "bg-ink text-white px-4" : "text-sub w-12"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* 알림 점 (피그마와 같게): 빨강 6px + 바깥 흰 테두리 1px, 비행기 끝 꼭짓점 위 */}
          <span className="relative flex">
            <Icon name={tab.icon} size={tab.size ?? 19} />
            {badge > 0 && !isActive && (
              <span className="absolute left-[11.6px] top-[-2.6px] w-[8px] h-[8px] rounded-full bg-g-red border border-white"></span>
            )}
          </span>
          {isActive && <span>{tab.label}</span>}
        </>
      )}
    </NavLink>
  )
}

function BottomNav() {
  const { applications } = useStore()
  const pendingForMe = applications.filter((a) => a.toId === ME && a.status === "pending").length

  return (
    <nav className="fixed left-0 right-0 bottom-0 z-40 pb-5 px-5 pointer-events-none">
      <div className="pointer-events-auto max-w-md mx-auto h-16 rounded-full glass shadow-[0_12px_30px_rgba(31,31,31,0.12)] flex items-center justify-between px-2">
        <NavItem tab={tabs[0]} />
        <NavItem tab={tabs[1]} />
        <NavItem tab={tabs[2]} />
        <NavItem tab={tabs[3]} badge={pendingForMe} />
        <NavItem tab={tabs[4]} />
      </div>
    </nav>
  )
}

export default BottomNav
