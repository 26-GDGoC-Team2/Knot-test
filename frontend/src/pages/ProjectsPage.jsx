import { useState } from "react"
import Background from "../components/Background"
import Sheet from "../components/Sheet"
import ConfirmDialog from "../components/ConfirmDialog"
import SelectChips from "../components/SelectChips"
import Icon from "../components/Icon"
import { TopBar, EmptyState, PrimaryButton, Toggle, ProjectBadge } from "../components/ui"
import { useStore } from "../lib/store-context"
import { PROJECT_TYPES, ROLES, SKILLS } from "../data"

const emptyProject = { name: "", type: "본인 입력", period: "", role: "", skills: [], description: "", link: "", isPublic: true }

const typeDesc = {
  "동아리 프로젝트": "동아리 공식 프로젝트 · 수료·신뢰 지표에 반영",
  "동아리원 팀": "동아리원과 꾸린 외부 프로젝트 · 신뢰 지표에 반영",
  "본인 입력": "개인·외부 프로젝트 · 기술·경험 유사도에만 반영",
}

const inputClass = "h-12 w-full rounded-2xl bg-white border border-line px-4 text-sm outline-none focus:border-ink"

// 프로젝트 경험 관리 (REQ-007)
function ProjectsPage() {
  const { user, addProject, removeProject } = useStore()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyProject)
  const [removing, setRemoving] = useState(null) // 삭제 확인할 프로젝트

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const valid = form.name.trim() && form.role && form.period.trim()

  return (
    <Background bottomSpace={false}>
      <TopBar
        title="프로젝트 경험"
        right={
          <button onClick={() => setAdding(true)} aria-label="프로젝트 추가" className="w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center">
            <Icon name="plus" size={20} />
          </button>
        }
      />

      {user.projects.length === 0 ? (
        <EmptyState title="등록한 프로젝트가 없어요" desc="프로젝트 경험은 AI 추천의 경험 유사도에 쓰여요." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {user.projects.map((p) => (
            <article key={p.id} className="glass rounded-[24px] p-4 flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-sub">{p.role} · {p.period}{p.skills.length > 0 && ` · ${p.skills.join(", ")}`}</p>
                </div>
                <ProjectBadge type={p.type} />
              </div>
              {p.description && <p className="text-sm text-gray-700">{p.description}</p>}
              <div className="flex items-center justify-between">
                <span className="text-xs text-sub">{p.isPublic ? "프로필에 공개" : "비공개"}</span>
                <button onClick={() => setRemoving(p)} className="h-9 px-3 rounded-full text-xs text-red-600 flex items-center gap-1">
                  <Icon name="trash" size={14} /> 삭제
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="text-xs text-sub mt-4">공개한 프로젝트는 부원 프로필에 보여요.</p>

      {adding && (
        <Sheet label="프로젝트 추가" onClose={() => setAdding(false)}>
          <h2 className="text-xl font-medium">프로젝트 추가</h2>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="프로젝트명" className={inputClass} />

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">종류</span>
            <SelectChips options={PROJECT_TYPES} value={[form.type]} onChange={(v) => v[0] && set("type", v[0])} single />
            <p className="text-xs text-sub">{typeDesc[form.type]}</p>
          </div>

          <input value={form.period} onChange={(e) => set("period", e.target.value)} placeholder="기간 (예: 2026.03–06)" className={inputClass} />

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">맡은 역할</span>
            <SelectChips options={ROLES} value={form.role ? [form.role] : []} onChange={(v) => set("role", v[0] ?? "")} single showRoleDot />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">사용 기술</span>
            <SelectChips options={SKILLS} value={form.skills} onChange={(v) => set("skills", v)} searchable />
          </div>

          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="설명 (선택)" className="w-full rounded-2xl bg-white border border-line p-4 text-sm outline-none focus:border-ink resize-none" />
          <input value={form.link} onChange={(e) => set("link", e.target.value)} placeholder="링크 (선택)" className={inputClass} />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">프로필에 공개</span>
            <Toggle checked={form.isPublic} onChange={(v) => set("isPublic", v)} label="프로필에 공개" />
          </div>

          <PrimaryButton
            disabled={!valid}
            onClick={() => {
              addProject({ ...form, name: form.name.trim() })
              setForm(emptyProject)
              setAdding(false)
            }}
          >
            추가하기
          </PrimaryButton>
        </Sheet>
      )}
      {removing && (
        <ConfirmDialog
          title={`'${removing.name}'을(를) 삭제하시겠습니까?`}
          desc="삭제한 프로젝트 경험은 되돌릴 수 없어요."
          confirmLabel="삭제"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            removeProject(removing.id)
            setRemoving(null)
          }}
        />
      )}
    </Background>
  )
}

export default ProjectsPage
