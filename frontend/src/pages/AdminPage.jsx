import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import Background from "../components/Background"
import ConfirmDialog from "../components/ConfirmDialog"
import { TopBar, Avatar } from "../components/ui"
import { useStore } from "../lib/store-context"
import { members as memberList } from "../data"
import { fetchAdminMembers, changeMemberRole, setMemberGraduation, fetchJoinCodeInfo, generateJoinCode, forceWithdrawMember } from "../lib/admin-map"

const card = "glass rounded-[26px] p-4"

// "2026-10-28T05:20:00Z" → "10.28 14:20" (보는 사람 시간대)
function stamp(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, "0")
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 위쪽 숫자 칸
function Stat({ label, value }) {
  return (
    <div className="glass rounded-[22px] px-3.5 py-3">
      <p className="text-xs text-sub">{label}</p>
      <p className="text-xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

// 운영진 관리 (REQ-028·029) — 피그마 'J · 운영진 관리'
function AdminPage() {
  const { user } = useStore()
  const [list, setList] = useState(null) // 서버 부원 목록 (null = 불러오는 중)
  const [error, setError] = useState("")
  const [codeInfo, setCodeInfo] = useState(null) // { createdAt }
  const [newCode, setNewCode] = useState("") // 방금 만든 코드 (이때만 원문을 볼 수 있어요)
  const [copied, setCopied] = useState(false)
  const [graduated, setGraduated] = useState({}) // 부원별 수료 기수 (수료 아니면 없음 · 기수 모르면 true)
  const [gen, setGen] = useState(7) // 수료 지정할 때 고르는 기수 (마지막으로 고른 값 기억)
  const [picking, setPicking] = useState(false) // 여러 명 수료 지정 모드
  const [picked, setPicked] = useState([]) // 고른 부원 id
  const [query, setQuery] = useState("")
  const [confirm, setConfirm] = useState(null) // { title, desc, label, danger, run }
  const [kick, setKick] = useState(null) // 강제 탈퇴할 부원
  const [kickReason, setKickReason] = useState("")

  const isAdmin = user.role === "ADMIN"

  useEffect(() => {
    if (!isAdmin) return
    Promise.all([fetchAdminMembers(), fetchJoinCodeInfo().catch(() => null)])
      .then(([members, info]) => {
        setList(members)
        setGraduated(Object.fromEntries(members.filter((m) => m.isGraduated).map((m) => [m.id, m.cohort ?? true])))
        const gens = members.map((m) => m.cohort).filter(Boolean)
        if (gens.length) setGen(Math.max(...gens)) // 기본값: 지금까지 지정한 가장 최근 기수
        setCodeInfo(info)
      })
      .catch((e) => setError(e.message))
  }, [isAdmin])

  if (!isAdmin) return <Navigate to="/me" replace />

  const adminCount = (list ?? []).filter((m) => m.role === "ADMIN").length
  const gradCount = Object.values(graduated).filter(Boolean).length
  // 이름 아래 한 줄: 희망 역할 (부원 목록에서 찾아요, 나는 내 프로필)
  const rolesOf = (id) => (id === user.id ? user.roles : memberList.find((m) => m.id === id)?.roles) ?? []
  const shown = (list ?? [])
    .filter((m) => !query.trim() || m.name.includes(query.trim()))
    // 운영진 먼저, 그다음 일반 부원 · 각각 이름 가나다순
    .sort((a, b) => (a.role === "ADMIN" ? 0 : 1) - (b.role === "ADMIN" ? 0 : 1) || a.name.localeCompare(b.name, "ko"))

  async function run(fn) {
    try {
      await fn()
    } catch (e) {
      window.alert(e.message)
    }
  }

  function askRole(m, role) {
    if (role === m.role) return
    if (m.role === "ADMIN" && role === "MEMBER" && adminCount <= 1) {
      window.alert("운영진은 최소 1명 남아 있어야 해요")
      return
    }
    const toAdmin = role === "ADMIN"
    setConfirm({
      title: toAdmin ? `${m.name}님을 운영진으로 지정할까요?` : `${m.name}님의 운영진 권한을 해제할까요?`,
      desc: toAdmin ? "운영진은 가입 코드와 부원 권한·수료를 관리할 수 있어요" : "권한 변경은 이력에 기록돼요",
      label: toAdmin ? "지정" : "해제",
      danger: !toAdmin,
      run: () =>
        run(async () => {
          await changeMemberRole(m.id, role)
          setList((l) => l.map((x) => (x.id === m.id ? { ...x, role } : x)))
        }),
    })
  }

  function toggleGraduation(m) {
    const next = !graduated[m.id]
    setConfirm({
      title: next ? `${m.name}님을 수료로 지정할까요?` : `${m.name}님의 수료 지정을 취소할까요?`,
      desc: "수료 여부는 부원 프로필과 AI 추천에 반영돼요",
      label: next ? "수료 지정" : "취소",
      pickGen: next, // 지정할 때만 기수 고르기
      run: (g) =>
        run(async () => {
          await setMemberGraduation(m.id, next, g)
          setGraduated((x) => {
            const copy = { ...x }
            if (next) copy[m.id] = g
            else delete copy[m.id]
            return copy
          })
        }),
    })
  }

  // 여러 명 한 번에 수료 지정
  function askBulk() {
    const ids = picked
    setConfirm({
      title: `${ids.length}명을 수료로 지정할까요?`,
      desc: "수료 여부는 부원 프로필과 AI 추천에 반영돼요",
      label: "수료 지정",
      pickGen: true,
      run: (g) =>
        run(async () => {
          const results = await Promise.allSettled(ids.map((id) => setMemberGraduation(id, true, g)))
          const okIds = ids.filter((_, i) => results[i].status === "fulfilled")
          setGraduated((x) => ({ ...x, ...Object.fromEntries(okIds.map((id) => [id, g])) }))
          setPicking(false)
          setPicked([])
          if (okIds.length < ids.length) window.alert(`${ids.length - okIds.length}명은 지정하지 못했어요. 다시 시도해 주세요.`)
        }),
    })
  }

  function askKick(m) {
    setKickReason("")
    setKick(m)
  }

  function doKick() {
    const m = kick
    const reason = kickReason.trim()
    setKick(null)
    run(async () => {
      await forceWithdrawMember(m.id, reason)
      setList((l) => l.filter((x) => x.id !== m.id)) // 탈퇴한 부원은 목록에서 빠져요
    })
  }

  function askNewCode() {
    setConfirm({
      title: "새 가입 코드를 만들까요?",
      desc: "이전 코드는 바로 막히고, 새로 가입하는 사람에게만 적용돼요",
      label: "자동 생성",
      run: () =>
        run(async () => {
          const r = await generateJoinCode()
          setNewCode(r.code)
          setCodeInfo({ createdAt: r.createdAt })
          setCopied(false)
        }),
    })
  }

  async function copyCode() {
    if (!newCode) return
    try {
      await navigator.clipboard.writeText(newCode)
      setCopied(true)
    } catch {
      window.alert(`복사하지 못했어요. 직접 적어 주세요: ${newCode}`)
    }
  }

  // 코드 칸: 방금 만든 코드면 글자, 아니면 빈칸 (보안상 저장된 코드는 다시 볼 수 없어요)
  // 서버가 만드는 코드는 8자리 (글자 수가 바뀌어도 칸 수는 코드 길이를 따라가요)
  const boxes = newCode ? newCode.split("") : Array.from({ length: 8 }, () => "")

  return (
    <Background bottomSpace={false}>
      <TopBar
        title="운영진 관리"
        right={<span className="h-7 px-2.5 rounded-full bg-[#E8F0FE] text-[#1A56C4] text-xs font-semibold flex items-center">운영진</span>}
      />

      {error ? (
        <div className={`${card} text-sm text-red-600`}>{error}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* 숫자 3칸 */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="전체 부원" value={list ? list.length : "-"} />
            <Stat label="수료" value={list ? gradCount : "-"} />
            <Stat label="운영진" value={list ? adminCount : "-"} />
          </div>

          {/* 가입 코드 */}
          <section className={`${card} flex flex-col gap-3`}>
            <h2 className="text-[15px] font-semibold">가입 코드</h2>
            <div className="flex gap-2">
              {boxes.map((ch, i) => (
                <span
                  key={i}
                  className="flex-1 aspect-square max-w-12 rounded-xl border border-line flex items-center justify-center text-lg font-semibold"
                >
                  {ch || <span className="text-[#BDC1C6]">·</span>}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copyCode}
                disabled={!newCode}
                className="h-11 rounded-full border border-line text-sm font-medium disabled:text-[#BDC1C6]"
              >
                {copied ? "복사했어요" : "복사"}
              </button>
              <button onClick={askNewCode} className="h-11 rounded-full bg-ink text-white text-sm font-medium">
                자동 생성
              </button>
            </div>
            <div className="text-xs text-sub leading-relaxed">
              {codeInfo ? <p>마지막 변경 · {stamp(codeInfo.createdAt)}</p> : <p>아직 만든 가입 코드가 없어요</p>}
              <p>
                {newCode
                  ? "이 코드는 지금만 볼 수 있어요. 복사해서 공지로 알려 주세요."
                  : "보안상 저장된 코드는 다시 볼 수 없어요. 새로 만들면 이전 코드는 바로 막혀요."}
              </p>
            </div>
          </section>

          {/* 부원 관리 */}
          <section className={`${card} flex flex-col`}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="text-[15px] font-semibold shrink-0">부원 관리</h2>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 검색"
                aria-label="이름 검색"
                className="h-10 w-40 rounded-full bg-black/[0.04] px-4 text-sm outline-none"
              />
            </div>
            {/* 여러 명 수료 지정: 체크해서 고르고 기수는 확인 창에서 골라요 */}
            {list && shown.length > 0 && (
              picking ? (
                <div className="flex items-center justify-between gap-2 py-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-[#1F1F1F]"
                      checked={shown.every((m) => picked.includes(m.id))}
                      onChange={(e) => setPicked(e.target.checked ? shown.map((m) => m.id) : [])}
                    />
                    전체 선택
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setPicking(false); setPicked([]) }} className="h-8 px-3 rounded-full text-xs text-sub">
                      취소
                    </button>
                    <button
                      onClick={askBulk}
                      disabled={picked.length === 0}
                      className="h-8 px-3 rounded-full bg-ink text-white text-xs font-medium disabled:bg-[#DADCE0]"
                    >
                      {picked.length}명 수료 지정
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setPicking(true)} className="self-end h-8 my-1 text-xs text-sub underline underline-offset-2">
                  여러 명 수료 지정
                </button>
              )
            )}
            {!list ? (
              <p className="py-6 text-center text-sm text-sub">불러오는 중…</p>
            ) : shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-sub">맞는 부원이 없어요</p>
            ) : (
              shown.map((m) => {
                const done = Boolean(graduated[m.id])
                const roles = rolesOf(m.id)
                return (
                  <div key={m.id} className="flex items-center gap-2 py-3 border-t border-[#F1F3F4] first:border-t-0">
                    {picking && (
                      <input
                        type="checkbox"
                        aria-label={`${m.name} 선택`}
                        className="w-4 h-4 accent-[#1F1F1F] shrink-0"
                        checked={picked.includes(m.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))}
                      />
                    )}
                    <span className="mr-1 shrink-0"><Avatar name={m.name} size={40} /></span>
                    <div className="flex-1 min-w-0">
                      {/* 줄바꿈 금지: 전체 글자 줄바꿈 설정(index.css) 때문에 이름이 세로로 쌓였어요 */}
                      <p className="text-[15px] font-semibold truncate" style={{ whiteSpace: "nowrap", textWrap: "nowrap" }}>
                        {m.name}
                        {m.id === user.id && <span className="text-[11px] text-sub font-normal"> (나)</span>}
                      </p>
                      <p className="text-xs text-sub truncate" style={{ whiteSpace: "nowrap", textWrap: "nowrap" }}>{roles.length ? roles.join("·") : m.email}</p>
                    </div>
                    {!picking && <>
                    <button
                      onClick={() => toggleGraduation(m)}
                      className={`h-8 px-3 rounded-full text-xs font-medium shrink-0 ${
                        done ? "bg-ink text-white" : "border border-line text-[#3C4043]"
                      }`}
                    >
                      {done ? (typeof graduated[m.id] === "number" ? `${graduated[m.id]}기 수료` : "수료") : "수료 지정"}
                    </button>
                    {/* 권한: 운영진 / 일반 */}
                    <span className="relative shrink-0">
                    <select
                      value={m.role}
                      onChange={(e) => (e.target.value === "KICK" ? askKick(m) : askRole(m, e.target.value))}
                      aria-label={`${m.name} 권한`}
                      className={`appearance-none w-[78px] h-8 pl-3 pr-6 rounded-full text-xs font-medium outline-none cursor-pointer ${
                        m.role === "ADMIN" ? "bg-[#E8F0FE] text-[#1A56C4]" : "border border-line text-[#3C4043] bg-white"
                      }`}
                    >
                      <option value="ADMIN">운영진</option>
                      <option value="MEMBER">일반</option>
                      {/* 강제 탈퇴: 일반 부원만 (운영진은 서버가 막아서, 먼저 일반으로 바꿔야 해요) */}
                      {m.role !== "ADMIN" && m.id !== user.id && <option value="KICK">강제 탈퇴</option>}
                    </select>
                    <span aria-hidden="true" className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] ${m.role === "ADMIN" ? "text-[#1A56C4]" : "text-sub"}`}>▼</span>
                    </span>
                    </>}
                  </div>
                )
              })
            )}
          </section>
          <p className="text-xs text-sub px-1">운영진은 최소 1명 남아 있어야 해요.<br />운영진은 일반으로 바꾼 뒤에 강제 탈퇴할 수 있어요.<br />변경 내용은 기록에 남아요.</p>
        </div>
      )}

      {kick && (
        <ConfirmDialog
          title={`${kick.name}님을 강제 탈퇴시킬까요?`}
          desc="탈퇴하면 다시 로그인할 수 없어요. 이유는 기록에 남아요."
          confirmLabel="강제 탈퇴"
          danger
          disabled={!kickReason.trim()}
          onClose={() => setKick(null)}
          onConfirm={doKick}
        >
          <textarea
            value={kickReason}
            onChange={(e) => setKickReason(e.target.value)}
            placeholder="탈퇴 이유 (필수)"
            aria-label="탈퇴 이유"
            rows={2}
            className="mt-2 w-full rounded-2xl bg-black/[0.04] px-4 py-3 text-sm outline-none resize-none text-left"
          />
        </ConfirmDialog>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          desc={confirm.desc}
          confirmLabel={confirm.label}
          danger={confirm.danger}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const fn = confirm.run
            setConfirm(null)
            fn(gen)
          }}
        >
          {/* 수료 지정할 때 기수 고르기 */}
          {confirm.pickGen && (
            <label className="mt-2 flex items-center justify-center gap-2 text-sm">
              수료 기수
              <select
                value={gen}
                onChange={(e) => setGen(Number(e.target.value))}
                className="h-10 px-3 rounded-full border border-line bg-white text-sm outline-none"
              >
                {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}기</option>
                ))}
              </select>
            </label>
          )}
        </ConfirmDialog>
      )}
    </Background>
  )
}

export default AdminPage
