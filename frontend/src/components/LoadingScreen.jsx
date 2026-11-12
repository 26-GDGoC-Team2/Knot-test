// 앱을 켤 때 보여 주는 화면들 (흰 화면 대신)

// 로딩 중: 가운데 도는 표시 + "로딩 중…"
export function LoadingScreen() {
  return (
    <div className="min-h-dvh bg-page flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <span className="w-9 h-9 rounded-full border-[3px] border-[#DADCE0] border-t-ink animate-spin" aria-hidden="true"></span>
      <p className="text-sm text-sub">로딩 중…</p>
    </div>
  )
}

// 로그인은 됐는데 정보를 못 받아 왔을 때: 로그아웃시키지 않고 다시 시도하게 해요
export function LoadErrorScreen() {
  return (
    <div className="min-h-dvh bg-page flex flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-lg font-semibold">정보를 불러오지 못했어요</p>
      <p className="text-sm text-sub leading-relaxed">서버가 잠시 응답하지 않았어요.<br />잠시 후 다시 시도해 주세요.</p>
      <button onClick={() => window.location.reload()} className="mt-3 h-12 px-8 rounded-full bg-ink text-white text-sm font-medium">
        다시 시도
      </button>
    </div>
  )
}
