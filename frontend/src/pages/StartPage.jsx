import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import Icon from "../components/Icon"
import { useStore } from "../lib/store-context"

// 카카오톡 인앱 브라우저에서는 Google 로그인이 막힘 (REQ-003)
const isKakaoInApp = typeof navigator !== "undefined" && /KAKAOTALK/i.test(navigator.userAgent)

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  )
}

// 아이폰인지 (카카오톡 안내에서 기기 탭 기본값)
const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent)

// 카카오톡 인앱 브라우저 안내 (REQ-003, 피그마 "J · 카카오톡 안내 · 아이폰/안드로이드")
function KakaoGuide() {
  const [device, setDevice] = useState(isIOS ? "ios" : "android")
  const [copied, setCopied] = useState(false)
  // trying: 자동으로 외부 브라우저 여는 중 / opened: 열림 / guide: 실패해서 안내
  const [phase, setPhase] = useState("trying")
  const left = useRef(false) // 화면을 벗어났는지 (= 외부 브라우저가 열렸는지)
  const url = typeof window !== "undefined" ? window.location.origin : ""
  const host = url.replace(/^https?:\/\//, "")

  // 카카오톡이 지원하는 "외부 브라우저로 열기" 주소
  function openExternal() {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`
  }

  // 들어오자마자 자동으로 외부 브라우저 열기 시도
  // 1.5초 안에 이 화면이 가려지면(외부 브라우저로 넘어감) 성공, 그대로면 실패로 보고 안내를 보여 줘요
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        left.current = true
        setPhase("opened")
      }
    }
    // 아이폰은 "외부 앱으로 열까요?" 창만 떠도 blur가 일어나서, 실제로 화면이 넘어갈 때(pagehide)만 성공으로 봐요
    const onBlur = () => {
      left.current = true
      setPhase("opened")
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", onBlur)
    openExternal()
    const t = setTimeout(() => {
      if (!left.current) setPhase("guide")
    }, 1500)
    return () => {
      clearTimeout(t)
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", onBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  // 자동으로 여는 중이거나 이미 열렸으면 안내 대신 짧은 안내만
  if (phase !== "guide") {
    return (
      <div className="min-h-dvh bg-page flex flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="w-14 h-14 rounded-[20px] bg-ink text-white flex items-center justify-center">
          <Icon name="external" size={24} />
        </span>
        {phase === "trying" ? (
          <p className="text-[15px] font-medium">브라우저로 여는 중이에요…</p>
        ) : (
          <>
            <p className="text-[15px] font-medium">브라우저에서 열었어요</p>
            <p className="text-sm text-sub">열린 브라우저에서 계속해 주세요.</p>
            <button onClick={() => setPhase("guide")} className="mt-2 text-[13px] text-sub underline underline-offset-2">
              직접 여는 방법 보기
            </button>
          </>
        )}
      </div>
    )
  }

  const steps =
    device === "ios"
      ? [
          {
            body: (
              <>
                오른쪽 아래{" "}
                <span className="inline-flex align-middle items-center justify-center w-[31px] h-[26px] rounded-lg bg-[#F1F3F4] mx-0.5">
                  <Icon name="share" size={15} />
                </span>{" "}
                공유 버튼 누르기
              </>
            ),
          },
          {
            body: (
              <>
                <b className="font-bold">Safari</b>(또는 Chrome) 선택
              </>
            ),
            sub: "안 보이면 목록 끝의 ‘더 보기’에서 찾아요",
          },
          { body: "열린 브라우저에서 다시 시작하기" },
        ]
      : [
          {
            body: (
              <>
                오른쪽 아래{" "}
                <span className="inline-flex align-middle items-center justify-center w-[22px] h-[26px] rounded-lg bg-[#F1F3F4] mx-0.5">
                  <Icon name="more" size={15} />
                </span>{" "}
                버튼 누르기
              </>
            ),
          },
          {
            body: (
              <>
                <b className="font-bold">다른 브라우저로 열기</b> 선택
              </>
            ),
          },
          { body: "열린 브라우저에서 다시 시작하기" },
        ]

  return (
    <div className="min-h-dvh bg-page">
      <div className="max-w-md mx-auto min-h-dvh flex flex-col px-5 pt-[76px] pb-[30px]">
        <div className="px-1.5">
          <span className="w-14 h-14 rounded-[20px] bg-ink text-white flex items-center justify-center">
            <Icon name="external" size={24} />
          </span>
          <h1
            className="mt-3 text-[29px] leading-[36.25px] tracking-[-0.6px] text-ink"
            style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
          >
            <span className="font-light">외부 브라우저로</span>
            <br />
            <b className="font-bold">열어 주세요</b>
          </h1>
          <p className="mt-3 text-sm leading-[22.4px] text-sub">카카오톡 안에서는 Google 로그인이 막혀 있어요.</p>
        </div>

        {/* 기기 탭 + 단계 */}
        <section className="mt-[22px] rounded-[28px] bg-white/80 border border-white px-[19px] pt-[15px] pb-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 p-1 rounded-full bg-[#F1F3F4]" role="tablist" aria-label="기기 선택">
            {[
              { v: "ios", label: "아이폰" },
              { v: "android", label: "안드로이드" },
            ].map((t) => (
              <button
                key={t.v}
                role="tab"
                aria-selected={device === t.v}
                onClick={() => setDevice(t.v)}
                className={`h-[38px] rounded-full text-[13px] ${device === t.v ? "bg-ink text-white font-medium" : "text-sub"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <ol className="flex flex-col gap-4">
            {steps.map((st, i) => (
              <li key={i} className="flex items-start gap-3.5">
                <span
                  className={`w-[30px] h-[30px] shrink-0 rounded-full text-[13px] font-semibold flex items-center justify-center ${
                    i === 2 ? "bg-[#F1F3F4] text-ink" : "bg-ink text-white"
                  }`}
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {i + 1}
                </span>
                <div className="pt-[5px] min-w-0">
                  <p className="text-[15px] leading-[21px] text-ink">{st.body}</p>
                  {st.sub && <p className="mt-0.5 text-xs text-sub">{st.sub}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 아래 버튼 */}
        <div className="mt-auto pt-8 flex flex-col gap-2.5">
          <button onClick={openExternal} className="h-14 rounded-full bg-ink text-white text-[15px] font-medium">
            브라우저로 바로 열기
          </button>
          <div className="h-[54px] rounded-full bg-white/80 border border-white pl-[21px] pr-[7px] flex items-center justify-between gap-2">
            <span className="text-[13px] text-sub truncate" style={{ fontFamily: "Outfit, sans-serif" }}>
              {host}
            </span>
            <button
              onClick={copyUrl}
              className="h-10 px-4 shrink-0 rounded-full bg-white border border-line text-[13px] flex items-center gap-1.5"
            >
              <Icon name={copied ? "check" : "copy"} size={14} />
              {copied ? "복사했어요" : "주소 복사"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 시작 화면 (REQ-001)
function StartPage() {
  const navigate = useNavigate()
  const { loggedIn, joined, login } = useStore()
  // 로그인 상태가 바뀐 "다음에" 이동해요.
  // (로그인과 이동을 동시에 하면, 아직 로그인 전 상태로 홈에 들어갔다가 시작 화면으로 되돌아오는 문제가 있었어요)
  // 이미 로그인한 사람이 이 화면에 오면 바로 홈으로 보내요.
  useEffect(() => {
    if (loggedIn) navigate(joined ? "/" : "/join/code", { replace: true })
  }, [loggedIn, joined, navigate])

  function start() {
    // TODO: 실제 Google 로그인 연동 (팀원 도움 필요)
    login()
  }

  // 카카오톡 안에서 열었으면 외부 브라우저 안내 화면 (외부 브라우저에서 다시 열면 아래 시작 화면이 보여요)
  if (isKakaoInApp) return <KakaoGuide />

  return (
    <div className="relative min-h-dvh overflow-hidden bg-white">
      {/* 4색 그라데이션 배경 (피그마 "P1 · 흰 바탕 · 시작") */}
      <div
        aria-hidden="true"
        className="absolute -inset-10 blur-[36px]"
        style={{
          background: [
            "radial-gradient(70% 75% at 0% 0%, rgba(66,133,244,0.23), rgba(66,133,244,0) 75%)",
            "radial-gradient(65% 60% at 100% 0%, rgba(234,67,53,0.12), rgba(234,67,53,0))",
            "radial-gradient(70% 75% at 100% 100%, rgba(251,188,4,0.10), rgba(251,188,4,0))",
            "radial-gradient(75% 70% at 0% 100%, rgba(52,168,83,0.42), rgba(52,168,83,0) 64%)",
            "linear-gradient(135deg, #D2E3FC 0%, rgba(230,244,234,0.98) 84%, #FEF7E0 100%)",
          ].join(", "),
        }}
      ></div>

      <div className="relative max-w-md mx-auto min-h-dvh px-8 pb-[63px] flex flex-col justify-end">
        <h1
          className="leading-[1.15] tracking-[-1.2px] text-ink whitespace-nowrap"
          // 기본 40px, 폭이 좁은 휴대폰에서는 한 줄이 넘치지 않게 조금 작아져요
          style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: "min(40px, 10.2vw)" }}
        >
          <span className="font-light">같이 만들 팀을</span>
          <br />
          <b className="font-bold">가장 빠르게 찾는 법</b>
        </h1>
        <p className="mt-3.5 pl-[3px] text-sm leading-[22.4px] text-sub">
          GDGoC 부원끼리 프로젝트 팀원을
          <br />
          쉽고 빠르게 찾아요.
        </p>

        <button
          onClick={start}
          className="mt-7 h-14 rounded-full bg-ink text-white text-[15px] font-medium flex items-center justify-center gap-2.5 shadow-[0_9px_28px_rgba(31,31,31,0.12)] active:scale-[0.99] transition-transform"
        >
          <span className="w-[18px] h-[18px] flex items-center justify-center">
            <GoogleMark />
          </span>
          Google로 시작하기
        </button>
        <span className="h-[15px] mt-3.5" aria-hidden="true"></span>
      </div>
    </div>
  )
}

export default StartPage
