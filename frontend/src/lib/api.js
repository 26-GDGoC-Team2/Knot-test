// ─────────────────────────────────────────────
// 백엔드 API 호출 (시험 연동용)
// 응답은 { success, data, message, error } 형식(CommonResponse)이라 data만 꺼내 돌려줘요.
// Access 토큰은 메모리에만 두고, Refresh 토큰은 서버가 심어 준 쿠키로 주고받아요.
// ─────────────────────────────────────────────
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

let accessToken = null
export function setAccessToken(token) {
  accessToken = token
}

// 서버를 기다리는 최대 시간. Render 무료 서버는 잠들었다 깨는 데 30초~1분이 걸려서 넉넉하게 잡아요
const TIMEOUT_MS = 45000

// 로그인이 완전히 끊겼을 때 부를 함수 (StoreProvider가 등록 → 로그아웃하고 시작 화면으로)
let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function api(path, { method = "GET", body, retried = false } = {}) {
  let res
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS) // 응답이 없으면 무한히 기다리지 않게
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include", // Refresh 쿠키를 함께 보내고 받음
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
  } catch {
    throw ctrl.signal.aborted
      ? new ApiError("서버 응답이 늦어요. 잠시 후 다시 시도해 주세요", 0, "TIMEOUT")
      : new ApiError("서버에 연결할 수 없어요", 0, "NETWORK")
  } finally {
    clearTimeout(timer)
  }
  const json = await res.json().catch(() => null)
  // 401(로그인 정보 만료 · 30분): 로그인 연장을 한 번 하고 같은 요청을 다시 보내요
  //  - 연장되면 사용자는 모르고 그대로 이어서 써요
  //  - 연장도 안 되면(탈퇴·다른 기기 로그아웃 등) 로그아웃하고 시작 화면으로
  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    try {
      const session = await refreshSession()
      setAccessToken(session.accessToken)
    } catch {
      onUnauthorized?.()
      throw new ApiError("로그인이 끊겼어요. 다시 로그인해 주세요", 401, "UNAUTHORIZED")
    }
    return api(path, { method, body, retried: true })
  }
  if (!res.ok || !json?.success) {
    throw new ApiError(json?.message ?? "요청에 실패했어요", res.status, json?.error?.code)
  }
  return json.data
}

// 세션 복원은 동시에 여러 번 불러도 서버 호출은 한 번만 해요.
// (개발 모드에서 화면이 두 번 그려지며 refresh가 겹치면 서버가 토큰 재사용으로 보고 로그인을 모두 취소해요)
let refreshing = null
export function refreshSession() {
  if (!refreshing) {
    refreshing = api("/auth/refresh", { method: "POST" }).finally(() => {
      setTimeout(() => (refreshing = null), 1000) // 직후의 중복 호출까지 같은 결과를 재사용
    })
  }
  return refreshing
}

// Google 로그인 시작 주소 (서버가 Google로 보냈다가 다시 프론트로 돌려보냄)
export const GOOGLE_LOGIN_URL = `${API_BASE}/auth/google`

// 서버 시간(세계 표준시, 끝에 Z) → 보는 사람 시간대의 날짜 "YYYY-MM-DD"
// 앞 10글자만 자르면 한국 시간 0~9시에 만든 건 하루 전 날짜로 보여서, 날짜로 바꾼 뒤 꺼내요
export function localDate(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

// 나눠서 주는 목록을 끝까지 다 받아요 (서버는 한 번에 최대 100개)
// 첫 장을 받아 전체 장 수(totalPages)를 확인한 뒤, 나머지 장을 한꺼번에 받아 이어 붙여요
// path 예: "/recruitments?sortBy=createdAt&sortDir=desc"
export async function fetchAllPages(path, size = 100) {
  const sep = path.includes("?") ? "&" : "?"
  const first = await api(`${path}${sep}size=${size}&page=1`)
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, (first.totalPages ?? 1) - 1) }, (_, i) => api(`${path}${sep}size=${size}&page=${i + 2}`)),
  )
  return [first, ...rest].flatMap((p) => p.items ?? [])
}
