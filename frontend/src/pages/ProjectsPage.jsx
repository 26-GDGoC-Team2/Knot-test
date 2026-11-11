import { useState } from "react"
import Background from "../components/Background"
import Sheet from "../components/Sheet"
import ConfirmDialog from "../components/ConfirmDialog"
import SelectChips from "../components/SelectChips"
import Icon from "../components/Icon"
import { TopBar, EmptyState, PrimaryButton, Toggle, ProjectBadge } from "../components/ui"
import { useStore } from "../lib/store-context"
import { ROLES, SKILLS, ME } from "../data"
import { periodText } from "../lib/profile-map"
import { isWebLink } from "../lib/helpers"

const emptyProject = { name: "", type: "본인 입력", start: "", end: "", ongoing: false, role: "", skills: [], description: "", link: "", isPublic: true }

// 예전에 글자로 저장한 기간("2026.03–06")을 수정할 때 달력 값으로 바꿔 넣기
function parsePeriod(text = "") {
  const m = text.match(/^(\d{4})\.(\d{2})(?:[–-](?:(\d{4})\.)?(\d{2}|진행 중))?$/)
  if (!m) return { start: "", end: "", ongoing: false }
  const [, sy, sm, ey, em] = m
  if (em === "진행 중") return { start: `${sy}-${sm}`, end: "", ongoing: true }
  return { start: `${sy}-${sm}`, end: em ? `${ey ?? sy}-${em}` : "", ongoing: false }
}

const typeDesc = {
  "동아리 프로젝트": "동아리 공식 프로젝트 · 수료·신뢰 지표에 반영",
  "동아리원 팀": "동아리원과 꾸린 외부 프로젝트 · 신뢰 지표에 반영",
  "본인 입력": "개인·외부 프로젝트 · 기술·경험 유사도에만 반영",
}

const inputClass = "h-12 w-full rounded-2xl bg-white border border-line px-4 text-sm outline-none focus:border-ink"

// 프로젝트 경험 관리 (REQ-007)
function ProjectsPage() {
  const { user, archives, addProject, updateProject, setProjectPublic, removeProject, importProject } = useStore()
  const [importing, setImporting] = useState(false) // 아카이브에서 가져오기 창
  const [importBusy, setImportBusy] = useState(null) // 가져오는 중인 아카이브 id
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null) // 수정 중인 프로젝트 (null이면 새로 추가)
  const [form, setForm] = useState(emptyProject)
  const [removing, setRemoving] = useState(null) // 삭제 확인할 프로젝트

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // 기간: 시작 월 필수, 진행 중이 아니면 종료 월도 필수 (시작보다 빠르면 안 돼요)
  const endBeforeStart = !form.ongoing && form.start && form.end && form.end < form.start
  // 링크는 선택이지만, 넣었다면 https:// 주소 (서버도 https만 받아요)
  const badLink = form.link.trim() && !isWebLink(form.link)
  const valid = form.name.trim() && form.role && form.start && (form.ongoing || form.end) && !endBeforeStart && !badLink

  // 가져올 수 있는 아카이브: GDGoC 프로젝트 중 내가 참여 부원인 것 (회의 결정)
  const myArchives = archives.filter((a) => a.type === "gdgoc" && a.members.some((m) => m.id === ME))
  // 이미 가져왔는지: 서버가 archiveId를 주면 그걸로, 아직이면 같은 이름의 '동아리 프로젝트'로 봐요
  const imported = (a) => user.projects.some((p) => p.archiveId === a.id || (p.type === "동아리 프로젝트" && p.name === a.title))
  async function doImport(a) {
    setImportBusy(a.id)
    try {
      await importProject(a.id)
    } catch (e) {
      window.alert(e.status === 404 ? "아직 서버에 가져오기 기능이 준비되지 않았어요" : e.message)
    } finally {
      setImportBusy(null)
    }
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyProject)
    setAdding(true)
  }
  function openEdit(p) {
    setEditing(p)
    setForm({ ...emptyProject, ...p, ...(p.start ? {} : parsePeriod(p.period)) })
    setAdding(true)
  }
  function close() {
    setAdding(false)
    setEditing(null)
    setForm(emptyProject)
  }
  // 서버에 저장 (실패하면 서버 안내 문구를 보여 주고 창은 그대로)
  async function save() {
    const fields = { ...form, type: editing ? editing.type : "본인 입력", name: form.name.trim(), period: periodText(form) } // 수정해도 종류는 그대로
    setSaving(true)
    try {
      if (editing) await updateProject(editing.id, fields)
      else await addProject(fields)
      close()
    } catch (e) {
      window.alert(e.message)
    } finally {
      setSaving(false)
    }
  }
  async function run(fn) {
    try {
      await fn()
    } catch (e) {
      window.alert(e.message)
    }
  }

  return (
    <Background bottomSpace={false}>
      <TopBar
        title="프로젝트 경험"
        right={
          <button onClick={openAdd} aria-label="프로젝트 추가" className="w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center">
            <Icon name="plus" size={20} />
          </button>
        }
      />

      {/* 아카이브에서 가져오기: GDGoC 프로젝트 기록을 내 경험으로 복사 */}
      <button
        onClick={() => setImporting(true)}
        className="glass w-full h-12 mb-3 rounded-full flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Icon name="archive" size={16} /> 아카이브에서 가져오기
      </button>

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
                {/* 공개 여부는 모든 종류에서 바꿀 수 있어요 */}
                <div className="flex items-center gap-2 text-xs text-sub">
                  <Toggle checked={p.isPublic} onChange={(v) => run(() => setProjectPublic(p.id, v))} label={`${p.name} 프로필에 공개`} />
                  {p.isPublic ? "프로필에 공개" : "비공개"}
                </div>
                {/* 수정·삭제: 모든 종류 가능 (회의 결정 · 자동으로 들어온 것도 본인이 고치거나 지울 수 있어요) */}
                <div className="flex items-center">
                  <button onClick={() => openEdit(p)} className="h-9 px-3 rounded-full text-xs text-sub">
                    수정
                  </button>
                  <button onClick={() => setRemoving(p)} className="h-9 px-3 rounded-full text-xs text-red-600 flex items-center gap-1">
                    <Icon name="trash" size={14} /> 삭제
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="text-xs text-sub mt-4">공개한 프로젝트는 부원 프로필에 보여요.</p>

      {importing && (
        <Sheet label="아카이브에서 가져오기" onClose={() => setImporting(false)}>
          <h2 className="text-xl font-medium">아카이브에서 가져오기</h2>
          <p className="text-sm text-sub -mt-2">내가 참여한 GDGoC 프로젝트를 내 경험으로 가져와요. 가져온 뒤 고쳐도 아카이브 원본은 그대로예요.</p>
          {myArchives.length === 0 ? (
            <p className="py-6 text-center text-sm text-sub">가져올 수 있는 프로젝트가 없어요</p>
          ) : (
            <div className="flex flex-col">
              {myArchives.map((a) => {
                const done = imported(a)
                const myRole = a.members.find((m) => m.id === ME)?.role
                return (
                  <div key={a.id} className="flex items-center gap-3 py-3 border-t border-[#F1F3F4] first:border-t-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold truncate" style={{ whiteSpace: "nowrap", textWrap: "nowrap" }}>{a.title}</p>
                      <p className="text-xs text-sub truncate" style={{ whiteSpace: "nowrap", textWrap: "nowrap" }}>
                        {[a.gen, periodText({ start: a.start, end: a.end, ongoing: Boolean(a.start) && !a.end }), myRole].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <button
                      onClick={() => doImport(a)}
                      disabled={done || importBusy === a.id}
                      className={`h-9 px-4 rounded-full text-xs font-medium shrink-0 ${done ? "bg-[#F1F3F4] text-[#9AA0A6]" : "bg-ink text-white disabled:opacity-60"}`}
                    >
                      {done ? "가져옴" : importBusy === a.id ? "가져오는 중…" : "가져오기"}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Sheet>
      )}

      {adding && (
        <Sheet label={editing ? "프로젝트 수정" : "프로젝트 추가"} onClose={close}>
          <h2 className="text-xl font-medium">{editing ? "프로젝트 수정" : "프로젝트 추가"}</h2>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="프로젝트명" className={inputClass} />

          {/* 직접 등록은 '본인 입력'만 돼요. 동아리 프로젝트·동아리원 팀은 활동·매칭 기록으로 자동으로 들어와요 */}
          <p className="text-xs text-sub -mt-2">{typeDesc["본인 입력"]}</p>

          {/* 기간: 달력에서 월을 골라요 */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">기간</span>
            <div className="flex items-center gap-2">
              <input type="month" aria-label="시작 월" value={form.start} max={form.end || undefined} onChange={(e) => set("start", e.target.value)} className={inputClass} />
              <span className="text-sub shrink-0">–</span>
              <input
                type="month"
                aria-label="종료 월"
                value={form.ongoing ? "" : form.end}
                min={form.start || undefined}
                disabled={form.ongoing}
                onChange={(e) => set("end", e.target.value)}
                className={`${inputClass} disabled:bg-[#F1F3F4] disabled:text-[#9AA0A6]`}
              />
            </div>
            <label className="self-start flex items-center gap-2 text-sm text-sub cursor-pointer">
              <input type="checkbox" checked={form.ongoing} onChange={(e) => set("ongoing", e.target.checked)} className="w-4 h-4 accent-[#1F1F1F]" />
              진행 중
            </label>
            {endBeforeStart && <p className="text-xs text-red-600">종료 월이 시작 월보다 빨라요</p>}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">맡은 역할</span>
            <SelectChips options={ROLES} value={form.role ? [form.role] : []} onChange={(v) => set("role", v[0] ?? "")} single showRoleDot />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">사용 기술</span>
            <SelectChips options={SKILLS} value={form.skills} onChange={(v) => set("skills", v)} searchable />
          </div>

          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="설명 (선택)" className="w-full rounded-2xl bg-white border border-line p-4 text-sm outline-none focus:border-ink resize-none" />
          <div className="flex flex-col gap-1.5">
            <input value={form.link} onChange={(e) => set("link", e.target.value)} placeholder="링크 (선택, https://...)" className={inputClass} />
            {badLink && <p className="text-xs text-red-600">https:// 로 시작하는 주소를 넣어 주세요</p>}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">프로필에 공개</span>
            <Toggle checked={form.isPublic} onChange={(v) => set("isPublic", v)} label="프로필에 공개" />
          </div>

          <PrimaryButton disabled={!valid || saving} onClick={save}>
            {saving ? "저장 중…" : editing ? "저장하기" : "추가하기"}
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
            const id = removing.id
            setRemoving(null)
            run(() => removeProject(id))
          }}
        />
      )}
    </Background>
  )
}

export default ProjectsPage
