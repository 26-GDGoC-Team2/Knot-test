import { useEffect, useState } from "react"
import { Link, useParams, useNavigate } from "react-router-dom"
import Background from "../components/Background"
import ProposeSheet from "../components/ProposeSheet"
import Sheet from "../components/Sheet"
import ProjectDetail from "../components/ProjectDetail"
import PostCard from "../components/PostCard"
import Icon from "../components/Icon"
import { TopBar, Avatar, RoleChip, Chip, EmptyState, SectionTitle, PrimaryButton, ProjectBadge } from "../components/ui"
import { useStore } from "../lib/store-context"
import { members, ME } from "../data"
import { isOpen } from "../lib/helpers"
import { fetchMemberProfile } from "../lib/profile-map"

// 부원 프로필 조회 (REQ-008)
function MemberProfilePage() {
  const { id } = useParams()
  const { posts, user } = useStore()
  const [proposing, setProposing] = useState(false)
  const [gensOpen, setGensOpen] = useState(false) // 수료 기수 펼치기
  const [openProject, setOpenProject] = useState(null) // 상세 창으로 보고 있는 프로젝트
  const navigate = useNavigate()
  const isMe = id === ME // 마이 화면에서 내 프로필 보기로 들어온 경우
  // 부원 목록에는 GitHub·프로젝트가 없어서, 들어올 때 서버에서 상세 프로필을 한 번 더 받아와요
  const [detail, setDetail] = useState(null)
  useEffect(() => {
    if (isMe) return
    let alive = true
    setDetail(null)
    fetchMemberProfile(id)
      .then((d) => alive && setDetail(d))
      .catch(() => {}) // 못 받으면 목록 정보만 보여 줘요
    return () => {
      alive = false
    }
  }, [id, isMe])
  const listed = members.find((m) => m.id === id)
  const member = isMe ? user : listed || detail ? { id, completedGens: [], projects: [], ...listed, ...detail } : null

  if (!member) {
    return (
      <Background>
        <TopBar />
        <EmptyState title="부원을 찾을 수 없어요" />
      </Background>
    )
  }

  // 수료한 기수 → "6기", 여러 개면 "4·5·6기", 없으면 "수료 전"
  const gensNums = (member.completedGens ?? []).map((g) => parseInt(g, 10)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
  const gensText = gensNums.length ? `${gensNums.join("·")}기` : "수료 전"
  const publicProjects = (member.projects ?? []).filter((p) => p.isPublic) // 공개한 프로젝트만 (개수 제한 없음)
  const theirOpenPosts = posts.filter((p) => p.authorId === member.id && isOpen(p))

  return (
    <Background>
      <TopBar title={isMe ? "내 프로필" : "부원 프로필"} />

      <section className="glass rounded-[30px] p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={member.name} size={64} />
          <div className="flex flex-col gap-1.5">
            <span className="text-xl font-semibold">{member.name}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1">{/* 역할은 이름과 같은 왼쪽 선에서 시작 */}
              {member.roles.map((r) => (
                <RoleChip key={r} role={r} plain />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 items-start">{/* items-start: 수료 칸을 펼쳐도 옆 칸은 그대로 */}
          {/* 피그마: 회색 칸 안에 작은 이름 + 굵은 값 (수료는 기수를 값으로) */}
          <div className="rounded-2xl bg-[#F6F7F9] p-3">
            <p className="text-[11px] text-sub">수료</p>
            {gensNums.length > 1 ? (
              // 여러 기수: 최근 기수 + 나머지 개수, 누르면 펼쳐서 전부 보여 줘요
              <button
                type="button"
                aria-expanded={gensOpen}
                onClick={() => setGensOpen((v) => !v)}
                className="flex items-center gap-1 font-semibold"
              >
                {gensNums[gensNums.length - 1]}기
                <span className="text-xs font-medium text-sub">+{gensNums.length - 1}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className={`text-sub transition-transform ${gensOpen ? "rotate-180" : ""}`}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            ) : (
              <p className="font-semibold">{gensText}</p>
            )}
            {gensOpen && gensNums.length > 1 && (
              <p className="mt-1 text-xs text-sub">{gensNums.map((n) => `${n}기`).join(" · ")}</p>
            )}
          </div>
          <div className="rounded-2xl bg-[#F6F7F9] p-3">
            <p className="text-[11px] text-sub">참여</p>
            <p className="font-semibold">{member.available ? "가능" : "어려움"}</p>
          </div>
          <div className="rounded-2xl bg-[#F6F7F9] p-3">
            <p className="text-[11px] text-sub">시작</p>
            <p className="font-semibold">{member.available && member.availableFrom ? `${member.availableFrom.slice(5).replace("-", "/")}~` : "-"}</p>
          </div>
        </div>

        {member.bio && <p className="text-sm leading-relaxed text-gray-700">{member.bio}</p>}

        {/* GitHub (피그마: 카드 안, 소개 아래) */}
        {member.github && (
          <a
            href={member.github}
            target="_blank"
            rel="noreferrer"
            className="self-start h-9 pl-3 pr-3.5 rounded-full bg-white border border-line text-xs flex items-center gap-1.5"
          >
            <Icon name="github" size={15} />
            <span className="font-semibold">GitHub</span>
            <span className="text-sub">{member.github.replace(/\/+$/, "").split("/").pop()}</span>
            <Icon name="external" size={12} className="text-[#9AA0A6]" />
          </a>
        )}

        {/* 기술 스택 · 관심 분야 (피그마: 카드 안 맨 아래) */}
        {(member.skills.length > 0 || member.interests.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {member.skills.map((s) => (
              <Chip key={s} variant="outline">{s}</Chip>
            ))}
            {member.interests.map((i) => (
              <Chip key={i} variant="soft">#{i}</Chip>
            ))}
          </div>
        )}
      </section>

      <SectionTitle>프로젝트 경험</SectionTitle>
      {publicProjects.length === 0 ? (
        <p className="text-sm text-sub">공개된 프로젝트가 없어요</p>
      ) : (
        <div className="flex flex-col gap-2">
          {publicProjects.map((p) => (
            // 누르면 아래에서 상세 창이 올라와요 (설명 · 링크까지)
            <button
              key={p.id}
              onClick={() => (isMe ? navigate(`/me/projects/${p.id}`) : setOpenProject(p))} // 내 프로필은 꽉 찬 화면, 다른 부원은 아래 창
              aria-label={`${p.name} 프로젝트 자세히 보기`}
              className="glass rounded-[22px] p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-sub">{[p.role, p.skills.join(", "), p.period].filter(Boolean).join(" · ")}</p>
              </div>
              <ProjectBadge type={p.type} />
              <Icon name="next" size={14} className="text-[#9AA0A6] shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* 프로젝트 경험 상세 창 */}
      {openProject && (
        <Sheet label="프로젝트 경험" onClose={() => setOpenProject(null)}>
          <ProjectDetail project={openProject} />
          <button onClick={() => setOpenProject(null)} className="h-12 rounded-full bg-ink text-white text-sm font-medium">
            닫기
          </button>
        </Sheet>
      )}

      {theirOpenPosts.length > 0 && (
        <>
          <SectionTitle>{isMe ? "내 모집글" : `${member.name}님의 모집글`}</SectionTitle>
          <div className="flex flex-col gap-3">
            {theirOpenPosts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </>
      )}

      <div className="fixed left-0 right-0 bottom-0 p-5 z-30">
        <div className="max-w-md mx-auto">
          {isMe ? (
            // 내 프로필: 제안 대신 수정
            <Link to="/me/edit" className="h-[58px] w-full rounded-full bg-ink text-white text-base font-medium flex items-center justify-center">
              프로필 수정
            </Link>
          ) : (
            <PrimaryButton onClick={() => setProposing(true)} disabled={!member.available} className="w-full">
              {member.available ? "팀 참여 제안" : "지금은 참여가 어려운 부원이에요"}
            </PrimaryButton>
          )}
        </div>
      </div>

      {proposing && <ProposeSheet member={member} onClose={() => setProposing(false)} />}
    </Background>
  )
}

export default MemberProfilePage
