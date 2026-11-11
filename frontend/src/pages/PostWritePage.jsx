import { useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import Background from "../components/Background"
import SelectChips from "../components/SelectChips"
import Sheet from "../components/Sheet"
import DateRangeSheet, { dateLabel, daysBetween } from "../components/DateRangeSheet"
import { TopBar, PrimaryButton, EmptyState } from "../components/ui"
import { useStore } from "../lib/store-context"
import { ROLES, SKILLS, INTERESTS, ME } from "../data"
import { memberFilled, roleDot, isKakaoOpenChat } from "../lib/helpers"

function Field({ label, required, hint, children }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">
          {label} {required && <span className="text-g-red">*</span>}
        </h2>
        {hint && <p className="text-xs text-sub mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

const inputClass =
  "h-13 w-full rounded-2xl bg-white border border-line px-4 text-sm outline-none focus:border-ink"

const emptyForm = {
  title: "",
  description: "",
  startDate: "",
  endDate: "",
  leaderRole: "", // 팀장(나)이 맡을 역할
  desiredRoles: [],
  roleCounts: {}, // 화면에서는 '나를 빼고 더 뽑을 인원' (저장할 때 내 역할에 팀장 자리 1을 더해요)
  roleSkills: {}, // 역할별 기술 { FE: { required: ["React"], preferred: ["Next.js"] } }
  interests: [],
  openChat: "", // 오픈채팅 링크 하나 (모집 중엔 모두, 마감 후엔 작성자·확정 팀원만)
}

// 모집글 작성·수정 (REQ-011, REQ-013)
function PostWritePage() {
  const { id } = useParams() // 수정일 때만 있음
  const navigate = useNavigate()
  const { user, posts, addPost, updatePost } = useStore()
  const editing = posts.find((p) => p.id === id)
  const contest = useLocation().state?.contest // 공모전 탭에서 넘어온 경우

  const [form, setForm] = useState(() =>
    editing
      ? {
          title: editing.title, description: editing.description,
          startDate: editing.startDate, endDate: editing.endDate,
          leaderRole: editing.leaderRole ?? "",
          desiredRoles: editing.desiredRoles,
          // 저장된 인원은 팀장 자리 포함 → 화면에는 팀장 자리를 뺀 '모집 인원'으로
          roleCounts: Object.fromEntries(
            editing.desiredRoles.map((r) => [r, Math.max(1, (editing.roleCounts?.[r] ?? 1) - (r === editing.leaderRole ? 1 : 0))])
          ),
          // 역할별 기술이 없던 예전 글이면 모든 역할에 같은 기술을 넣어서 시작
          roleSkills:
            editing.roleSkills ??
            Object.fromEntries(
              editing.desiredRoles.map((r) => [r, { required: editing.requiredSkills ?? [], preferred: editing.preferredSkills ?? [] }])
            ),
          interests: editing.interests, openChat: editing.openChat,
        }
      : contest
        ? {
            ...emptyForm,
            leaderRole: user.roles[0] ?? "",
            title: `${contest.title} 팀원 모집`,
            description: `${contest.host}에서 여는 '${contest.title}'에 함께 나갈 팀원을 찾아요. (접수 ~${contest.end.slice(5).replace("-", ".")})\n공모전 원문: ${contest.url}`,
            interests: contest.interest ? [contest.interest] : [],
          }
        : { ...emptyForm, leaderRole: user.roles[0] ?? "" }
  )
  const [dateOpen, setDateOpen] = useState(false) // 진행 기간 달력 시트
  const [roleWarn, setRoleWarn] = useState("") // 확정 팀원이 있는 역할을 빼려 할 때 안내
  const [pick, setPick] = useState(null) // 기술 고르는 시트: { role, kind: "required" | "preferred" }

  if (id && (!editing || editing.authorId !== ME)) { // 작성자만 수정 (운영진 관리는 회의 후 결정)
    return (
      <Background>
        <TopBar />
        <EmptyState title="수정할 수 없는 모집글이에요" />
      </Background>
    )
  }

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const dateError = form.startDate && form.endDate && form.startDate > form.endDate
  // 역할마다 최소 인원: 1명, 수정할 때는 이미 확정된 팀원(팀장 제외)보다 적게 못 줄임
  const minFor = (r) => Math.max(1, editing ? memberFilled(editing, r) : 0)
  const countOf = (r) => form.roleCounts[r] ?? 1
  const recruitCount = form.desiredRoles.reduce((sum, r) => sum + countOf(r), 0)

  // 모집 역할을 고르면 그 역할 인원 칸이 생기고, 빼면 사라져요
  // 이미 확정 팀원이 있는 역할 (수정할 때 빼면 그 팀원이 어느 역할에도 안 잡혀서 못 빼게 해요)
  const lockedRoles = editing ? ROLES.filter((r) => memberFilled(editing, r) > 0) : []
  function setRoles(roles) {
    const missing = lockedRoles.filter((r) => !roles.includes(r))
    if (missing.length) {
      setRoleWarn(`${missing.join(", ")}에는 확정 팀원이 있어서 뺄 수 없어요.`)
      roles = [...roles, ...missing]
    } else {
      setRoleWarn("")
    }
    setForm((f) => ({
      ...f,
      desiredRoles: roles,
      roleCounts: Object.fromEntries(roles.map((r) => [r, f.roleCounts[r] ?? 1])),
      roleSkills: Object.fromEntries(roles.map((r) => [r, f.roleSkills[r] ?? { required: [], preferred: [] }])),
    }))
  }
  // 역할별 기술
  const skillsOf = (r) => form.roleSkills[r] ?? { required: [], preferred: [] }
  function setSkills(r, kind, list) {
    setForm((f) => {
      const cur = f.roleSkills[r] ?? { required: [], preferred: [] }
      const other = kind === "required" ? "preferred" : "required"
      // 같은 기술이 필수·우대에 동시에 들어가지 않게, 새로 고른 쪽에서 빼요
      return {
        ...f,
        roleSkills: { ...f.roleSkills, [r]: { ...cur, [kind]: list, [other]: cur[other].filter((x) => !list.includes(x)) } },
      }
    })
  }

  // 수정한 인원대로 저장하면 모든 자리가 차는지 (= 저장하는 순간 모집 마감)
  const willClose =
    editing &&
    !editing.closed &&
    form.desiredRoles.length > 0 &&
    form.desiredRoles.every((r) => memberFilled(editing, r) >= countOf(r))
  function setCount(r, n) {
    setForm((f) => ({ ...f, roleCounts: { ...f.roleCounts, [r]: Math.min(10, Math.max(minFor(r), n)) } }))
  }
  const valid =
    form.title.trim() &&
    form.description.trim() &&
    form.startDate &&
    form.endDate &&
    !dateError &&
    form.leaderRole &&
    form.desiredRoles.length &&
    form.desiredRoles.every((r) => countOf(r) >= minFor(r)) &&
    isKakaoOpenChat(form.openChat) // 카카오 오픈채팅 주소만

  async function submit() {
    // 팀장도 정원에 포함: 내 역할 인원에 팀장 자리 1을 더해서 저장 (예: 내 역할 FE + FE 1명 모집 → FE 2)
    const roleCounts = Object.fromEntries(form.desiredRoles.map((r) => [r, countOf(r)]))
    roleCounts[form.leaderRole] = (roleCounts[form.leaderRole] ?? 0) + 1
    // 역할별 기술 + 전체 목록(카드·검색·추천에 쓰는 합친 목록)
    const roleSkills = Object.fromEntries(form.desiredRoles.map((r) => [r, skillsOf(r)]))
    const requiredSkills = [...new Set(form.desiredRoles.flatMap((r) => skillsOf(r).required))]
    const preferredSkills = [...new Set(form.desiredRoles.flatMap((r) => skillsOf(r).preferred))].filter((x) => !requiredSkills.includes(x))
    const fields = {
      ...form,
      roleSkills,
      requiredSkills,
      preferredSkills,
      roleCounts,
      recruitCount: recruitCount + 1, // 팀 전체 인원 = 모집 인원 + 팀장 (게시하면 1/전체로 시작)
      title: form.title.trim(),
      description: form.description.trim(),
      openChat: form.openChat.trim(),
    }
    try {
      if (editing) {
        await updatePost(editing.id, fields)
        navigate(`/posts/${editing.id}`, { replace: true })
      } else {
        const newId = await addPost(fields)
        navigate(`/posts/${newId}`, { replace: true })
      }
    } catch (e) {
      window.alert(e.message) // 서버 검증 메시지 그대로 안내
    }
  }

  return (
    <Background>
      <TopBar title={editing ? "모집글 수정" : "모집글 쓰기"} />

      <div className="flex flex-col gap-7">
        <Field label="제목" required>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="예: 금융 AI 공모전 팀원 모집" className={inputClass} />
        </Field>

        <Field label="프로젝트 소개" required hint="AI 추천의 기준이 돼요. 무엇을 만드는지 구체적으로 적어 주세요.">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={5}
            className="w-full rounded-2xl bg-white border border-line p-4 text-sm outline-none focus:border-ink resize-none"
          />
        </Field>

        <Field label="프로젝트 진행 기간" required>
          {/* 누르면 달력 바텀시트가 열려요 */}
          <button
            type="button"
            onClick={() => setDateOpen(true)}
            className="h-13 w-full rounded-2xl bg-white border border-line px-4 text-sm flex items-center justify-between"
          >
            {form.startDate && form.endDate ? (
              <>
                <span className="font-medium">
                  {dateLabel(form.startDate)} <span className="text-[#9AA0A6]">→</span> {dateLabel(form.endDate)}
                </span>
                <span className="text-xs text-sub">{daysBetween(form.startDate, form.endDate)}일</span>
              </>
            ) : (
              <>
                <span className="text-[#9AA0A6]">시작일 – 종료일 선택</span>
                <span aria-hidden="true" className="text-sub">📅</span>
              </>
            )}
          </button>
          {dateError && <p className="text-xs text-red-600">종료일이 시작일보다 빨라요</p>}
        </Field>

        <Field label="내 역할" required hint="팀장인 내가 맡을 역할">
          <SelectChips options={ROLES} value={form.leaderRole ? [form.leaderRole] : []} onChange={(v) => set("leaderRole", v[0] ?? "")} single showRoleDot />
        </Field>

        <Field label="모집 역할" required>
          <SelectChips options={ROLES} value={form.desiredRoles} onChange={setRoles} showRoleDot />
          {roleWarn && <p className="text-xs text-red-600">{roleWarn}</p>}
        </Field>

        <Field label="역할별 모집 인원 · 기술" required hint={<>팀장을 제외한 모집 인원을 정해 주세요<br />기술은 선택 사항이에요</>}>
          {form.desiredRoles.length === 0 ? (
            <p className="text-xs text-sub">모집 역할을 먼저 골라 주세요</p>
          ) : (
            <div className="glass rounded-[22px] px-4 py-1 flex flex-col">
              {form.desiredRoles.map((r) => (
                <div key={r} className="border-t border-line first:border-t-0 pb-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium inline-flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${roleDot[r] ?? "bg-gray-400"}`}></span>
                    {r}
                    {editing && memberFilled(editing, r) > 0 && (
                      <span className="text-xs text-sub font-normal">확정 {memberFilled(editing, r)}명</span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    <button type="button" aria-label={`${r} 인원 줄이기`} disabled={countOf(r) <= minFor(r)} onClick={() => setCount(r, countOf(r) - 1)} className="w-10 h-10 rounded-full bg-white border border-line text-lg disabled:opacity-30">−</button>
                    <span className="w-8 text-center text-base font-semibold">{countOf(r)}명</span>
                    <button type="button" aria-label={`${r} 인원 늘리기`} disabled={countOf(r) >= 10} onClick={() => setCount(r, countOf(r) + 1)} className="w-10 h-10 rounded-full bg-white border border-line text-lg disabled:opacity-30">+</button>
                  </div>
                </div>
                {/* 이 역할의 필수 · 우대 기술 */}
                <div className="flex flex-col gap-1.5">
                  {[
                    { kind: "required", label: "필수" },
                    { kind: "preferred", label: "우대" },
                  ].map(({ kind, label }) => (
                    <div key={kind} className="flex items-start gap-2">
                      <span className="w-7 shrink-0 pt-[7px] text-xs text-sub">{label}</span>
                      <div className="flex-1 flex gap-1.5 flex-wrap">
                        {skillsOf(r)[kind].map((sk) => (
                          <button
                            key={sk}
                            type="button"
                            aria-label={`${sk} 빼기`}
                            onClick={() => setSkills(r, kind, skillsOf(r)[kind].filter((x) => x !== sk))}
                            className={`h-[30px] pl-3 pr-2 rounded-full text-xs inline-flex items-center gap-1 ${
                              kind === "required" ? "bg-ink text-white" : "bg-white border border-line"
                            }`}
                          >
                            {sk} <span aria-hidden="true" className="opacity-60">✕</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setPick({ role: r, kind })}
                          className="h-[30px] px-3 rounded-full border border-dashed border-[#BDC1C6] text-xs text-sub"
                        >
                          + 추가
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              ))}
            </div>
          )}
          {willClose && (
            <p className="text-xs text-red-600">
              이대로 저장하면 모든 자리가 차서 모집이 마감되고, 대기 중인 지원·제안은 자동으로 거절돼요.
            </p>
          )}
        </Field>

        <Field label="관심 분야" hint="선택">
          <SelectChips options={INTERESTS} value={form.interests} onChange={(v) => set("interests", v)} />
        </Field>

        {/* 회의 결정: 문의용·팀 채팅방을 하나의 오픈채팅방으로 */}
        <Field label="오픈채팅 링크" required hint="모집 중에는 문의를 위해 모두에게, 마감 후에는 확정 팀원에게만 보여요">
          <input value={form.openChat} onChange={(e) => set("openChat", e.target.value)} placeholder="https://open.kakao.com/o/..." className={inputClass} />
          {form.openChat.trim() && !isKakaoOpenChat(form.openChat) && (
            <p className="text-xs text-red-600">카카오 오픈채팅 주소(https://open.kakao.com/…)를 넣어 주세요</p>
          )}
        </Field>

        <p className="text-xs text-sub">팀원 매칭은 공모전·외부 프로젝트 모집용이며 수료에는 반영되지 않아요.</p>

        <PrimaryButton disabled={!valid} onClick={submit}>
          {editing ? "수정 완료" : "모집글 올리기"}
        </PrimaryButton>
      </div>
      {/* 역할별 기술 고르기 (프로필과 같은 방식: 목록에서 고르고, 없으면 검색해서 + 추가) */}
      {pick && (
        <Sheet label="기술 고르기" onClose={() => setPick(null)}>
          <h2 className="text-xl font-medium">
            {pick.role} {pick.kind === "required" ? "필수" : "우대"} 기술
          </h2>
          <SelectChips
            options={SKILLS}
            value={skillsOf(pick.role)[pick.kind]}
            onChange={(v) => setSkills(pick.role, pick.kind, v)}
            searchable
          />
          <PrimaryButton onClick={() => setPick(null)}>완료</PrimaryButton>
        </Sheet>
      )}
      {dateOpen && (
        <DateRangeSheet
          start={form.startDate}
          end={form.endDate}
          onApply={(from, to) => setForm((f) => ({ ...f, startDate: from, endDate: to }))}
          onClose={() => setDateOpen(false)}
        />
      )}
    </Background>
  )
}

export default PostWritePage
