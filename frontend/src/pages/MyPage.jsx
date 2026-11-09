import { Link } from "react-router-dom"
import Background from "../components/Background"
import BottomNav from "../components/BottomNav"
import Icon from "../components/Icon"
import { Avatar, RoleChip, CompletedBadge } from "../components/ui"
import { useStore } from "../lib/store-context"
import { EMPTY_ACTIVITY, totalScore, conditions } from "../lib/activity"

function MenuItem({ to, icon, label }) {
  return (
    <Link to={to} className="h-14 rounded-full bg-white/70 flex items-center gap-3 pl-2 pr-5 text-sm font-medium">
      <span className="w-10 h-10 rounded-full border border-line flex items-center justify-center">
        <Icon name={icon} size={17} />
      </span>
      <span className="flex-1">{label}</span>
      <Icon name="next" size={16} className="text-gray-400" />
    </Link>
  )
}

// 마이페이지 (REQ-023)
function MyPage() {
  const { user } = useStore()
  const activity = user.activity ?? EMPTY_ACTIVITY
  const total = totalScore(activity)
  const doneCount = conditions(activity).filter((c) => c.done).length

  return (
    <Background>
      <header className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold">마이</h1>
      </header>

      {/* 누르면 다른 부원이 보는 것과 같은 모양으로 내 프로필 보기 */}
      <Link to="/members/me" aria-label="내 프로필 보기" className="glass rounded-[30px] p-4 flex items-center gap-4">
        <Avatar name={user.name} size={60} />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <span className="text-lg font-semibold">{user.name}</span>
            {/* 수료는 운영진이 지정한 기수 (체크리스트는 본인 확인용이라 상관없음) */}
            <span className="pt-1">
              <CompletedBadge gens={user.completedGens} showEmpty className="bg-white" />
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">{/* 역할은 이름과 같은 왼쪽 선에서 시작 */}
            {user.roles.map((r) => (
              <RoleChip key={r} role={r} plain />
            ))}
          </div>
          <p className="text-xs text-sub truncate">{user.skills.join(" · ")}</p>
        </div>
        {/* 누르면 넘어간다는 표시 (메뉴 화살표와 같은 회색) */}
        <Icon name="next" size={16} className="shrink-0 text-gray-400" />
      </Link>

      {/* 활동 현황 (본인만 보임) → 누르면 개인 활동 체크리스트 */}
      <Link to="/me/activity" className="glass rounded-[30px] p-4 mt-3 flex flex-col gap-2">{/* 아래 칸 바탕이 거의 안 보여서, 칸 안쪽 여백(12px)까지 더해 제목 위 여백과 눈으로 같게 */}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[15px] font-semibold">내 활동 현황</span>
          {/* 위 카드 화살표 끝선에 맞춤 (화살표 그림이 아이콘 칸 안쪽에 있어서 5px 들여 씀) */}
          <span className="mr-[5px] text-xs text-sub">본인만 볼 수 있어요</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/80 px-3.5 py-3">
            <p className="text-xs text-sub">누적 활동 점수</p>
            <p className="text-2xl font-semibold tracking-tight">
              {total}
              <span className="text-sm font-normal text-sub"> 점</span>
            </p>
          </div>
          <div className="rounded-2xl bg-white/80 px-3.5 py-3">
            <p className="text-xs text-sub">수료 조건</p>
            <p className="text-2xl font-semibold tracking-tight">
              {doneCount}
              <span className="text-sm font-normal text-sub"> / 3</span>
            </p>
          </div>
        </div>
      </Link>

      <section className="glass rounded-[30px] p-2 mt-3 flex flex-col gap-1.5">
        <MenuItem to="/me/edit" icon="edit" label="프로필 수정" />
        <MenuItem to="/me/projects" icon="briefcase" label="프로젝트 경험" />
        <MenuItem to="/me/activity" icon="check" label="개인 활동 체크리스트" />
        <MenuItem to="/my-posts" icon="doc" label="내 모집글" />
        <MenuItem to="/settings" icon="settings" label="설정" />
      </section>

      <BottomNav />
    </Background>
  )
}

export default MyPage
