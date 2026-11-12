// 안드로이드인지 (홈에서 뒤로가기 두 번 → 앱 종료에 써요)
export const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)
