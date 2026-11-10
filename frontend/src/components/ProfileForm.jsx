import { useState } from "react"
import SelectChips from "./SelectChips"
import { PrimaryButton, Toggle } from "./ui"
import { ROLES, SKILLS, INTERESTS } from "../data"
// GitHub: 서버와 같은 규칙 (https://github.com/... 만)
const isGithubUrl = (url = "") => /^https:\/\/(www\.)?github\.com\/[\w.-]+(\/[\w.-]*)*\/?$/i.test(url.trim())

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

// 프로필 작성·수정 공통 폼 (REQ-004, REQ-005, REQ-006)
function ProfileForm({ initial, submitLabel, onSubmit }) {
  const [form, setForm] = useState({
    name: initial.name ?? "",
    roles: initial.roles ?? [],
    skills: initial.skills ?? [],
    interests: initial.interests ?? [],
    available: initial.available ?? true,
    availableFrom: initial.availableFrom ?? "",
    github: initial.github ?? "",
    bio: initial.bio ?? "",
  })

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const valid =
    form.name.trim() && form.roles.length && form.skills.length && form.interests.length &&
    (!form.github.trim() || isGithubUrl(form.github)) // GitHub는 선택이지만, 넣었다면 https://github.com/ 주소

  return (
    <div className="flex flex-col gap-7">
      <Field label="이름" required hint="실명은 모든 화면에 표시돼요">
        <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="실명" className={inputClass} />
      </Field>

      <Field label="희망 역할" required hint="1개 이상 골라 주세요">
        <SelectChips options={ROLES} value={form.roles} onChange={(v) => set("roles", v)} showRoleDot />
      </Field>

      <Field label="보유 기술" required hint="목록에 없으면 검색해서 추가할 수 있어요">
        <SelectChips options={SKILLS} value={form.skills} onChange={(v) => set("skills", v)} searchable />
      </Field>

      <Field label="관심 분야" required>
        <SelectChips options={INTERESTS} value={form.interests} onChange={(v) => set("interests", v)} />
      </Field>

      <Field label="참여 가능 여부" required hint="'현재 어려움'이면 AI 추천과 새 모집글 알림에서 빠져요">
        <div className="glass rounded-[22px] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{form.available ? "참여 가능" : "현재 어려움"}</span>
            <Toggle checked={form.available} onChange={(v) => set("available", v)} label="참여 가능 여부" />
          </div>
          {form.available && (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-sub">참여 가능 시작일 (선택)</span>
              <input type="date" value={form.availableFrom} onChange={(e) => set("availableFrom", e.target.value)} className="h-10 rounded-xl bg-white border border-line px-3 text-sm" />
            </label>
          )}
        </div>
      </Field>

      <Field label="GitHub" hint="선택">
        <input value={form.github} onChange={(e) => set("github", e.target.value)} placeholder="https://github.com/아이디" className={inputClass} />
        {form.github.trim() && !isGithubUrl(form.github) && (
          <p className="text-xs text-red-600">https://github.com/ 으로 시작하는 주소를 넣어 주세요</p>
        )}
      </Field>

      <Field label="자기소개" hint="선택 · AI 추천에서 모집글과 비교하는 데 쓰여요">
        <textarea
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          rows={4}
          placeholder="어떤 프로젝트를 해 봤고, 무엇을 하고 싶은지 적어 주세요"
          className="w-full rounded-2xl bg-white border border-line p-4 text-sm outline-none focus:border-ink resize-none"
        />
      </Field>

      <PrimaryButton disabled={!valid} onClick={() => onSubmit({ ...form, name: form.name.trim(), github: form.github.trim() })}>
        {submitLabel}
      </PrimaryButton>
    </div>
  )
}

export default ProfileForm
