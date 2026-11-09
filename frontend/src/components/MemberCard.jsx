import { Link } from "react-router-dom"
import { Avatar, CompletedBadge, RoleChip } from "./ui"
import Icon from "./Icon"

// 부원 목록 카드 (REQ-010)
function MemberCard({ member }) {
  return (
    <Link to={`/members/${member.id}`} className="block">
      <article className="glass rounded-[26px] p-4 flex items-center gap-3">
        <Avatar name={member.name} size={48} />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{member.name}</span>
            <CompletedBadge gens={member.completedGens} />
            {!member.available && <span className="text-[11px] text-gray-400">참여 어려움</span>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">{/* 역할은 이름과 같은 왼쪽 선에서 시작 */}
            {member.roles.map((r) => (
              <RoleChip key={r} role={r} plain />
            ))}
          </div>
          <p className="text-xs text-sub truncate">
            {member.skills.slice(0, 3).join(" · ")} · #{member.interests[0]}
          </p>
        </div>
        <Icon name="next" size={18} className="text-gray-400" />
      </article>
    </Link>
  )
}

export default MemberCard
