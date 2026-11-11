import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import Background from "../components/Background"
import Icon from "../components/Icon"
import SelectChips from "../components/SelectChips"
import { useStore } from "../lib/store-context"
import { ARCHIVE_TYPES, GENERATIONS, LINK_KINDS, ME, ROLES, SKILLS, members as allMembers } from "../data"
import { archiveMemberName } from "../lib/archive"
import { isWebLink } from "../lib/helpers"

const box = "rounded-2xl border border-white bg-white/85 px-3.5 text-sm outline-none text-ink"
const dashed = "h-[30px] px-[11px] rounded-full border border-dashed border-[#BDC1C6] text-sub text-xs flex items-center"

// 항목 제목 줄
function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[13px] font-semibold">{label}</span>
        {hint && <span className="text-[11px] text-sub">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// 지울 수 있는 칩
function RemovableChip({ children, onRemove, dark = false }) {
  return (
    <span
      className={`h-[30px] px-[11px] rounded-full text-xs flex items-center gap-[5px] ${
        dark ? "bg-ink text-white" : "bg-white border border-[#DADCE0]"
      }`}
    >
      {children}
      {onRemove && (
        <button type="button" aria-label="빼기" onClick={onRemove} className="opacity-60">
          ×
        </button>
      )}
    </span>
  )
}

// 아카이브 등록 · 수정 (REQ-030)
function ArchiveFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, archives, addArchive, updateArchive } = useStore()
  const editing = archives.find((a) => a.id === id)

  const [type, setType] = useState(editing?.type ?? "gdgoc")
  const [title, setTitle] = useState(editing?.title ?? "")
  const [gen, setGen] = useState(editing?.gen ?? GENERATIONS[0])
  const [start, setStart] = useState(editing?.start ?? "")
  const [end, setEnd] = useState(editing?.end ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [members, setMembers] = useState(editing?.members ?? [{ id: ME, role: user.roles[0] ?? "FE" }])
  const [skills, setSkills] = useState(editing?.skills ?? [])
  const [links, setLinks] = useState(editing?.links ?? [{ kind: "github", url: "" }])

  // 펼쳐지는 입력칸
  const [memberSearch, setMemberSearch] = useState(null) // null이면 닫힘
  const [external, setExternal] = useState(null) // { name, role }

  const memberResults =
    memberSearch === null
      ? []
      : allMembers
          .filter((m) => !members.some((x) => x.id === m.id))
          .filter((m) => !memberSearch.trim() || m.name.includes(memberSearch.trim()))
          .slice(0, 5)
  const cleanLinks = links.filter((l) => l.url.trim())
  const badLink = cleanLinks.some((l) => !isWebLink(l.url)) // 결과물 링크는 https:// 주소만
  const canSubmit = title.trim() && description.trim() && start && members.length > 0 && !badLink

  const [saving, setSaving] = useState(false)

  // 서버에 저장 (실패하면 서버 안내 문구를 보여 주고 화면은 그대로)
  async function submit() {
    if (!canSubmit || saving) return
    const fields = {
      type, title: title.trim(), gen, start, end, description: description.trim(),
      members, skills, links: cleanLinks.map((l) => ({ ...l, url: l.url.trim() })),
    }
    setSaving(true)
    try {
      if (editing) {
        await updateArchive(editing.id, fields)
        navigate(`/archive/${editing.id}`, { replace: true })
      } else {
        const newId = await addArchive(fields)
        navigate(`/archive/${newId}`, { replace: true })
      }
    } catch (e) {
      window.alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Background plain>
      <header className="flex items-center justify-between">
        <button
          aria-label="닫기"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/archive"))}
          className="w-11 h-11 rounded-full bg-white/65 border border-white flex items-center justify-center"
        >
          <Icon name="close" size={18} strokeWidth={2} />
        </button>
        <span className="text-base font-semibold">{editing ? "프로젝트 수정" : "프로젝트 등록"}</span>
        <span className="w-11"></span>
      </header>

      <div className="mt-2.5 flex flex-col gap-3">
        {!editing && (
          <div className="rounded-2xl bg-white/60 border border-dashed border-[#BDC1C6] px-3.5 py-2.5 text-xs leading-relaxed text-[#3C4043]">
            한 프로젝트는 <b className="font-semibold">팀당 1건</b>만 등록돼요. 팀원 중 한 명만 등록하면 함께한 부원 모두에게 보여요.
          </div>
        )}

        <Field label="구분">
          <div className="grid grid-cols-2 gap-1 bg-white/70 border border-white rounded-full p-1">
            {Object.entries(ARCHIVE_TYPES).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setType(k)}
                className={`h-9 rounded-full text-[13px] ${type === k ? "bg-ink text-white font-medium" : "text-sub"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="프로젝트명">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 동아리 출석 체크 웹" aria-label="프로젝트명" className={`${box} h-[46px]`} />
        </Field>

        <div className="grid grid-cols-[1fr_1.8fr] gap-2">
          <label className={`${box} h-[52px] flex flex-col justify-center relative`}>
            <span className="text-[10px] text-sub">기수</span>
            <span className="flex justify-between">{gen} <span className="text-[#9AA0A6]">▾</span></span>
            <select value={gen} onChange={(e) => setGen(e.target.value)} aria-label="기수" className="absolute inset-0 opacity-0">
              {GENERATIONS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <div className={`${box} h-[52px] flex flex-col justify-center`}>
            <span className="text-[10px] text-sub">기간</span>
            <div className="flex items-center gap-1 text-sm">
              <input type="month" value={start} onChange={(e) => setStart(e.target.value)} aria-label="시작 월" className="w-full bg-transparent outline-none min-w-0" />
              <span className="text-[#9AA0A6]">–</span>
              <input type="month" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="끝 월" className="w-full bg-transparent outline-none min-w-0" />
            </div>
          </div>
        </div>

        <Field label="프로젝트 설명">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="무엇을 만들었고, 어떤 결과가 있었는지 적어 주세요."
            aria-label="프로젝트 설명"
            className={`${box} py-[11px] leading-normal resize-none`}
          />
        </Field>

        <Field label="참여 부원" hint="외부 인원은 이름만 보여요">
          <div className="flex gap-1.5 flex-wrap">
            {members.map((m, i) => (
              <RemovableChip
                key={i}
                dark={m.id === ME}
                onRemove={m.id === ME ? null : () => setMembers(members.filter((_, k) => k !== i))}
              >
                {archiveMemberName(user, m)}
                {m.id === ME ? " (나)" : m.external ? " · 외부" : ""} ·
                {/* 역할: 처음엔 프로필 첫 번째 희망 역할, 실제로 맡은 역할로 바꿀 수 있어요 */}
                <select
                  value={m.role}
                  onChange={(e) => setMembers(members.map((x, k) => (k === i ? { ...x, role: e.target.value } : x)))}
                  aria-label={`${archiveMemberName(user, m)} 역할`}
                  className={`appearance-none bg-transparent outline-none cursor-pointer underline decoration-dotted underline-offset-2 ${m.id === ME ? "text-white" : ""}`}
                >
                  {[...new Set([m.role, ...ROLES])].filter(Boolean).map((r) => (
                    <option key={r} value={r} className="text-ink">{r}</option>
                  ))}
                </select>
              </RemovableChip>
            ))}
            {/* 추가 버튼은 늘 둘 다 보이고, 아래 입력 칸은 누른 쪽 하나만 열려요 */}
            <button type="button" onClick={() => { setMemberSearch(""); setExternal(null) }} className={dashed}>+ 부원 검색</button>
            <button type="button" onClick={() => { setExternal({ name: "", role: ROLES[0] }); setMemberSearch(null) }} className={dashed}>+ 외부 인원</button>
          </div>

          {/* 부원 검색 */}
          {memberSearch !== null && (
            <div className="flex flex-col gap-1.5">
              <input autoFocus value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="이름 검색" aria-label="부원 이름 검색" className={`${box} h-11`} />
              <div className="flex gap-1.5 flex-wrap">
                {memberResults.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMembers([...members, { id: m.id, role: m.roles[0] }])
                      setMemberSearch(null)
                    }}
                    className="h-[30px] px-3 rounded-full bg-black/5 text-xs"
                  >
                    + {m.name} · {m.roles[0]}
                  </button>
                ))}
                <button type="button" onClick={() => setMemberSearch(null)} className="h-[30px] px-3 text-xs text-sub">닫기</button>
              </div>
            </div>
          )}

          {/* 외부 인원 추가 (한 번에 부원 검색과 외부 인원 중 한 칸만 열려요) */}
          {external !== null && (
            <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sub">외부 인원 추가 · 동아리 부원이 아닌 사람</span>
              <button type="button" onClick={() => setExternal(null)} className="h-[30px] px-3 text-xs text-sub">닫기</button>
            </div>
            <div className="flex gap-1.5">
              <input autoFocus value={external.name} onChange={(e) => setExternal({ ...external, name: e.target.value })} placeholder="이름" aria-label="외부 인원 이름" className={`${box} h-11 flex-1 min-w-0`} />
              <select value={external.role} onChange={(e) => setExternal({ ...external, role: e.target.value })} aria-label="역할" className={`${box} h-11`}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!external.name.trim()}
                onClick={() => {
                  setMembers([...members, { name: external.name.trim(), role: external.role, external: true }])
                  setExternal(null)
                }}
                className="h-11 px-4 rounded-2xl bg-ink text-white text-sm disabled:bg-gray-300"
              >
                추가
              </button>
            </div>
            </div>
          )}
        </Field>

        <Field label="사용 기술">
          {/* 프로필과 같은 방식: 목록에서 고르고, 없으면 검색창에 쓰고 + 추가 */}
          <SelectChips options={SKILLS} value={skills} onChange={setSkills} searchable />
        </Field>

        <Field label="결과물 링크">
          <div className="flex flex-col gap-1.5">
            {links.map((l, i) => (
              <div key={i} className={`${box} h-11 flex items-center gap-2`}>
                <select
                  value={l.kind}
                  onChange={(e) => setLinks(links.map((x, k) => (k === i ? { ...x, kind: e.target.value } : x)))}
                  aria-label="링크 종류"
                  className="bg-transparent text-xs text-sub outline-none"
                >
                  {Object.entries(LINK_KINDS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
                <input
                  value={l.url}
                  onChange={(e) => setLinks(links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))}
                  placeholder="https://"
                  aria-label="링크 주소"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[13px]"
                />
                {links.length > 1 && (
                  <button type="button" aria-label="링크 빼기" onClick={() => setLinks(links.filter((_, k) => k !== i))} className="text-sub">×</button>
                )}
              </div>
            ))}
            {badLink && <p className="text-xs text-red-600">링크는 https:// 로 시작하는 주소를 넣어 주세요</p>}
            <button
              type="button"
              onClick={() => setLinks([...links, { kind: "deploy", url: "" }])}
              className="h-9 rounded-full border border-dashed border-[#BDC1C6] text-sub text-xs"
            >
              + 링크 추가 (배포 사이트, 발표 자료 등)
            </button>
          </div>
        </Field>
      </div>

      <div className="fixed left-0 right-0 bottom-0 z-30 pointer-events-none">
        <div className="pointer-events-auto max-w-md mx-auto px-[18px] pb-[22px] pt-3 bg-gradient-to-t from-page via-page/90 to-transparent">
          <button
            onClick={submit}
            disabled={!canSubmit || saving}
            className="w-full h-14 rounded-full bg-ink text-white text-[15px] font-medium shadow-[0_10px_24px_rgba(31,31,31,0.2)] disabled:bg-gray-300 disabled:shadow-none"
          >
            {saving ? "저장 중…" : canSubmit ? (editing ? "저장하기" : "등록하기") : badLink ? "링크 주소를 확인해 주세요" : "프로젝트명·기간·설명을 채워 주세요"}
          </button>
        </div>
      </div>
    </Background>
  )
}

export default ArchiveFormPage
