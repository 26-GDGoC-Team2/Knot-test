import { useParams } from "react-router-dom"
import Background from "../components/Background"
import ProjectDetail from "../components/ProjectDetail"
import { TopBar, EmptyState } from "../components/ui"
import { useStore } from "../lib/store-context"

// 내 프로젝트 경험 상세 (마이 → 프로젝트 경험에서 눌렀을 때 · 꽉 찬 화면)
function ProjectDetailPage() {
  const { id } = useParams()
  const { user } = useStore()
  const project = user.projects.find((p) => String(p.id) === id)

  return (
    <Background bottomSpace={false}>
      <TopBar title="프로젝트 경험" />
      {!project ? (
        <EmptyState title="프로젝트를 찾을 수 없어요" desc="삭제됐거나 없는 프로젝트예요." />
      ) : (
        <section className="glass rounded-[28px] p-5 flex flex-col gap-5">
          <ProjectDetail project={project} />
          <p className="text-xs text-sub">{project.isPublic ? "부원 프로필에 공개 중이에요" : "비공개 · 나만 볼 수 있어요"}</p>
        </section>
      )}
    </Background>
  )
}

export default ProjectDetailPage
