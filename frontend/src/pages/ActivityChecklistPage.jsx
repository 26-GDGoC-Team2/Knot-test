import Background from "../components/Background"
import Icon from "../components/Icon"
import { TopBar } from "../components/ui"
import { useStore } from "../lib/store-context"
import { ACTIVITY_CATEGORIES, EMPTY_ACTIVITY, itemScore, totalScore, conditions } from "../lib/activity"

// − 숫자 + 버튼
function Stepper({ value, onChange, min = 0, max = 99 }) {
  const btn = "w-10 h-10 rounded-xl border border-line bg-white text-lg flex items-center justify-center disabled:opacity-30"
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <button type="button" aria-label="빼기" disabled={value <= min} onClick={() => onChange(value - 1)} className={btn}>−</button>
      <span className="w-7 text-center text-[15px] font-semibold tabular-nums">{value}</span>
      <button type="button" aria-label="더하기" disabled={value >= max} onClick={() => onChange(value + 1)} className={btn}>+</button>
    </div>
  )
}

const card = "rounded-3xl bg-white border border-white px-4 py-4"

// 개인 활동 체크리스트 (본인만 보임)
function ActivityChecklistPage() {
  const { user, updateUser } = useStore()
  const activity = user.activity ?? EMPTY_ACTIVITY
  const total = totalScore(activity)
  const conds = conditions(activity)
  const left = conds.filter((c) => !c.done).length

  const save = (next) => updateUser({ activity: { ...activity, ...next } })
  const setItem = (id, patch) => save({ items: activity.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })
  const removeItem = (id) => save({ items: activity.items.filter((it) => it.id !== id) })
  const addItem = (cat) =>
    save({
      items: [
        ...activity.items,
        { id: `act${Date.now()}`, cat: cat.key, ...(cat.kind === "range" ? { score: cat.max } : {}), ...(cat.kind === "option" ? { option: cat.options[0].value } : {}) },
      ],
    })

  return (
    <Background plain bottomSpace={false}>
      <TopBar title="개인 활동 체크리스트" />

      <p className="rounded-2xl bg-[#E8F0FE] text-[#1967D2] text-[13px] px-4 py-3">
        본인만 볼 수 있어요 · 프로필에는 수료 여부만 공개돼요
      </p>

      {/* 수료 진행 현황 */}
      <section className={`${card} mt-4 flex flex-col gap-3`}>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold">수료 진행 현황</span>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              left === 0 ? "bg-[#E6F4EA] text-[#137333]" : "bg-[#FEF7E0] text-[#B06000]"
            }`}
          >
            {left === 0 ? "수료 조건 달성" : `남은 조건 ${left}개`}
          </span>
        </div>
        <div className="flex flex-col">
          {conds.map((c) => (
            <div key={c.label} className="flex items-center gap-3 py-2.5 border-t border-[#F1F3F4] first:border-t-0">
              <span
                className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center ${
                  c.done ? "bg-[#1E8E3E] text-white" : "border-2 border-[#C4C7C5]"
                }`}
              >
                {c.done && <Icon name="check" size={14} strokeWidth={2.6} />}
              </span>
              <span className="flex-1 text-sm">{c.label}</span>
              <span className={`text-[13px] font-semibold ${c.done ? "text-[#1E8E3E]" : "text-sub"}`}>
                {c.value} / {c.goal}
                {c.unit}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 누적 활동 점수 */}
      <section className={`${card} mt-3 flex items-center justify-between`}>
        <div>
          <p className="text-[15px] font-semibold">누적 활동 점수</p>
          <p className="text-xs text-sub mt-0.5">다음 코어 멤버 선발 때 평가에 반영돼요</p>
        </div>
        <p className="text-[32px] font-semibold tracking-[-1px]">
          {total}
          <span className="text-sm font-normal text-sub"> 점</span>
        </p>
      </section>

      {/* 수료 조건 참여 기록 */}
      <h2 className="mt-7 text-[17px] font-semibold">수료 조건 참여 기록</h2>
      <p className="mt-1 text-xs text-sub">활동 점수와 별도로 수료 조건에만 쓰여요</p>
      <section className={`${card} mt-3 flex flex-col`}>
        {[
          { key: "sessions", label: "정규세션 · 대회 참여", sub: "수료하려면 4회 이상" },
          { key: "studies", label: "스터디 참여", sub: "수료하려면 1회 이상" },
        ].map((r) => (
          <div key={r.key} className="flex items-center gap-3 py-2.5 border-t border-[#F1F3F4] first:border-t-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-sub">{r.sub}</p>
            </div>
            <Stepper value={activity[r.key]} onChange={(v) => save({ [r.key]: v })} />
          </div>
        ))}
      </section>

      {/* 활동 점수 */}
      <h2 className="mt-7 text-[17px] font-semibold">활동 점수</h2>
      <div className="mt-3 flex flex-col gap-3">
        {ACTIVITY_CATEGORIES.map((cat) => {
          const items = activity.items.filter((it) => it.cat === cat.key)
          const sum = items.reduce((s, it) => s + itemScore(it), 0)
          return (
            <section key={cat.key} className={`${card} flex flex-col gap-3`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold">{cat.label}</span>
                  <span className="text-sm font-semibold">{sum}점</span>
                </div>
                <p className="text-xs text-sub mt-0.5">{cat.desc}</p>
              </div>

              {items.map((it, i) => (
                <div key={it.id} className="flex flex-col gap-2 pt-3 border-t border-[#F1F3F4]">
                  {/* 이름 쓰는 칸 + 삭제 */}
                  <div className="flex items-center gap-2">
                    <input
                      value={it.name ?? ""}
                      onChange={(e) => setItem(it.id, { name: e.target.value })}
                      placeholder={cat.placeholder}
                      aria-label={`${cat.itemLabel} ${i + 1} 이름`}
                      className="flex-1 min-w-0 h-11 rounded-xl bg-[#F6F7F9] px-3.5 text-sm outline-none focus:ring-2 focus:ring-ink/10"
                    />
                    <button
                      type="button"
                      aria-label={`${cat.itemLabel} ${i + 1} 삭제`}
                      onClick={() => removeItem(it.id)}
                      className="w-9 h-9 shrink-0 rounded-full text-[#9AA0A6] flex items-center justify-center"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>

                  {/* 점수 */}
                  {cat.kind === "range" && (
                    <div className="flex items-center justify-between pl-1 pr-11">
                      <span className="text-xs text-sub">{cat.sub}</span>
                      <Stepper value={it.score} max={cat.max} onChange={(v) => setItem(it.id, { score: v })} />
                    </div>
                  )}
                  {cat.kind === "option" && (
                    <div className="flex gap-1 flex-wrap pl-1">
                      {cat.options.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setItem(it.id, { option: o.value })}
                          className={`h-8 px-3 rounded-full text-xs ${
                            it.option === o.value ? "bg-ink text-white" : "bg-[#F1F3F4] text-sub"
                          }`}
                        >
                          {o.label} {o.score}점
                        </button>
                      ))}
                    </div>
                  )}
                  {cat.kind === "fixed" && <p className="pl-1 text-xs text-sub">{cat.score}점</p>}
                </div>
              ))}

              <button
                type="button"
                onClick={() => addItem(cat)}
                className="h-12 rounded-2xl border-[1.5px] border-dashed border-[#C4C7C5] text-sm font-medium"
              >
                + {cat.itemLabel} 추가
              </button>
            </section>
          )
        })}
      </div>
    </Background>
  )
}

export default ActivityChecklistPage
