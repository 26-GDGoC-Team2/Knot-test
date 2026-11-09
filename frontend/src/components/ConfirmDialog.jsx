import { useState } from "react"
import { createPortal } from "react-dom"
import { curlyQuotes } from "../lib/helpers"

// 확인 창: 실수로 누르지 않게 한 번 더 물어봐요
// 예) "최하린님의 지원을 수락하시겠습니까?"  [취소] [수락]
function ConfirmDialog({ title, desc, confirmLabel = "확인", danger = false, disabled = false, onConfirm, onClose }) {
  const [done, setDone] = useState(false) // 빠르게 두 번 눌러도 한 번만 실행
  // 상세 시트 안에서 열어도 화면 전체를 덮도록 body 바로 아래에 그려요
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-6 fade-in" onClick={onClose}>
      <section
        role="alertdialog"
        aria-label={title}
        className="sheet-up w-full max-w-[340px] rounded-[28px] bg-white px-5 pt-6 pb-5 flex flex-col gap-2 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[17px] font-semibold leading-snug break-keep">{curlyQuotes(title)}</p>
        {desc && <p className="text-[13px] text-sub leading-relaxed break-keep">{curlyQuotes(desc)}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="h-12 rounded-full bg-[#F1F3F4] text-sm font-medium">
            취소
          </button>
          <button
            type="button"
            disabled={disabled || done}
            onClick={() => {
              if (done) return
              setDone(true)
              onConfirm()
            }}
            className={`h-12 rounded-full text-white text-sm font-medium disabled:bg-gray-300 ${danger ? "bg-[#D93025]" : "bg-ink"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}

export default ConfirmDialog
