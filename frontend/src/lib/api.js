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

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include", // Refresh 쿠키를 함께 보내고 받음
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError("서버에 연결할 수 없어요", 0, "NETWORK")
  }
  const json = await res.json().catch(() => null)
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
