// 화면 공통 배경. 화면마다 감싸서 씀
// 배경 디자인(빛번짐 등)은 팀에서 정하기 전까지 빼 둠 → 정해지면 SHOW_GLOW를 true로
const SHOW_GLOW = false

// plain: 이 화면만 빛번짐 없이 단색 (SHOW_GLOW가 true일 때만 의미 있음)
function Background({ children, bottomSpace = true, plain = false }) {
  return (
    <div className="min-h-screen bg-page relative overflow-x-hidden">
      {SHOW_GLOW && !plain && (
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 max-w-md mx-auto">
        <div className="absolute -right-28 -top-24 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(66,133,244,0.3),transparent_68%)]"></div>
        <div className="absolute -left-32 top-52 w-64 h-64 rounded-full bg-[radial-gradient(circle,rgba(251,188,4,0.24),transparent_68%)]"></div>
        <div className="absolute -right-36 top-[520px] w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(52,168,83,0.22),transparent_68%)]"></div>
        <div className="absolute -left-16 top-[660px] w-52 h-52 rounded-full bg-[radial-gradient(circle,rgba(234,67,53,0.16),transparent_68%)]"></div>
      </div>
      )}
      <main className={`relative max-w-md mx-auto px-5 pt-5 ${bottomSpace ? "pb-32" : "pb-8"}`}>
        {children}
      </main>
    </div>
  )
}

export default Background
