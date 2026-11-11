import { Link, useLocation } from "react-router-dom"
import { isOpen, getPerson, teamSize, isIOS } from "../lib/helpers"
import { useStore } from "../lib/store-context"

// 모집글 카드 (디자인: J · 홈 · 모집글 탭) — 홈 · 부원 프로필 · 내 모집글에서 같이 써요
// asSheet: 누르면 지금 화면 위에 창으로 띄우기 (홈) / 아니면 꽉 찬 화면으로 넘어가기 (부원 프로필 · 내 모집글)
function PostCard({ post, asSheet = false }) {
  const { user } = useStore()
  const location = useLocation()
  const open = isOpen(post)
  const author = getPerson(user, post.authorId)
  return (
    // 아이폰: 창을 열 때 뒤로 가기 기록을 쌓지 않아요 → 옆으로 쓸어넘겨도 창이 닫히지 않고 버튼으로만 닫혀요 (회의 결정)
    <Link to={`/posts/${post.id}`} state={asSheet ? { background: location } : undefined} replace={asSheet && isIOS} className="block">
      <article className="rounded-[26px] bg-white/70 border border-white shadow-[0_20px_40px_rgba(0,0,0,0.05)] px-[18px] py-3.5 flex flex-col gap-2 active:scale-[0.99] transition-transform">
        {/* 상태 점: 글자 ● 대신 작은 원 (모집글 상세와 같게) */}
        <span className={`mt-[7px] text-xs font-medium inline-flex items-center gap-1.5 ${open ? "text-[#137333]" : "text-gray-400"}`}>
          <span className="ml-[1.5px] w-1.5 h-1.5 shrink-0 rounded-full bg-current"></span>
          {open ? "모집 중" : "모집 완료"} · {author?.name ?? "탈퇴한 회원"}
        </span>
        <span className="text-[18px] font-semibold tracking-[-0.3px]">{post.title}</span>
        <div className="flex items-center justify-between">
          {/* 역할별 인원은 DB 확정 후 "FE 1 · AI 1"처럼 바꾸기 */}
          <span className="text-xs text-sub">{post.desiredRoles.join(" · ")}</span>
          <span className="text-base font-light">
            {teamSize(post)}
            <span className="text-[#9AA0A6]">/{post.recruitCount}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {post.requiredSkills.map((s) => (
            <span key={s} className="text-[11px] px-2 py-[3px] rounded-full bg-ink text-white">필수 {s}</span>
          ))}
          {post.preferredSkills.slice(0, 2).map((s) => (
            <span key={s} className="text-[11px] px-2 py-[3px] rounded-full border border-[#DADCE0] text-[#3C4043]">우대 {s}</span>
          ))}
        </div>
      </article>
    </Link>
  )
}

export default PostCard
