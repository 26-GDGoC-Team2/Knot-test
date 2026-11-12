import { Component } from "react"

// 화면을 그리다 오류가 나도 앱 전체가 흰 화면이 되지 않게 잡아 줘요
// (예: 서버가 예상과 다른 값을 줬을 때) → "문제가 생겼어요" + 홈으로 / 새로고침
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error("화면 오류:", error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-dvh bg-page flex flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-lg font-semibold">문제가 생겼어요</p>
        <p className="text-sm text-sub leading-relaxed">화면을 보여 주는 중에 오류가 났어요.<br />홈으로 가거나 새로고침해 주세요.</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => (window.location.href = "/")} className="h-12 px-6 rounded-full border border-line bg-white text-sm font-medium">
            홈으로
          </button>
          <button onClick={() => window.location.reload()} className="h-12 px-6 rounded-full bg-ink text-white text-sm font-medium">
            새로고침
          </button>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
