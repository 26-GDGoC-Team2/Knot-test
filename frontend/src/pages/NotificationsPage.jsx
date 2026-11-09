import { useState } from "react"
import { useNavigate } from "react-router-dom"
import Background from "../components/Background"
import { TopBar, EmptyState } from "../components/ui"
import Icon from "../components/Icon"
import ConfirmDialog from "../components/ConfirmDialog"
import { useStore } from "../lib/store-context"
import { shortDate, isVisibleNoti, curlyQuotes } from "../lib/helpers"

// 알림 목록 (REQ-022)
function NotificationsPage() {
  const navigate = useNavigate()
  const { notifications, applications, markAllRead, markRead, removeNotification, clearNotifications } = useStore()
  const [askClear, setAskClear] = useState(false)

  // 최근 30일 + 수락이 취소된 매칭 알림은 안 보여요
  const list = notifications.filter((n) => isVisibleNoti(n, applications))
  const unread = list.filter((n) => !n.read).length

  return (
    <Background bottomSpace={false}>
      <TopBar
        title="알림"
        right={
          <button
            onClick={markAllRead}
            disabled={unread === 0}
            className="h-10 pl-3 rounded-full text-[13px] font-medium disabled:text-[#BDC1C6]"
          >
            모두 읽음
          </button>
        }
      />

      {list.length === 0 ? (
        <EmptyState title="받은 알림이 없어요" desc="최근 30일 동안 받은 알림이 여기에 보여요." />
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-sub">최근 30일 알림{unread > 0 ? ` · 읽지 않음 ${unread}` : ""}</span>
            <button onClick={() => setAskClear(true)} className="text-xs text-sub underline underline-offset-2">
              전체 삭제
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {list.map((n) => (
              <div key={n.id} className={`rounded-[22px] p-4 flex items-start gap-3 ${n.read ? "bg-white/60" : "bg-white"}`}>
                {/* 누르면 읽음 처리하고 해당 화면으로 */}
                <button
                  onClick={() => {
                    markRead(n.id)
                    navigate(n.link)
                  }}
                  className="flex-1 min-w-0 flex items-start gap-3 text-left"
                >
                  <span
                    className={`relative w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
                      n.read ? "bg-[#F1F3F4] text-sub" : "bg-ink text-white"
                    }`}
                  >
                    <Icon name="bell" size={17} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm leading-snug ${n.read ? "text-[#3C4043]" : "font-semibold"}`}>{curlyQuotes(n.text)}</span>
                    <span className="block text-xs text-sub mt-1">{shortDate(n.date)}</span>
                  </span>
                </button>
                <button
                  aria-label="이 알림 삭제"
                  onClick={() => removeNotification(n.id)}
                  className="w-8 h-8 -mr-1 -mt-1 shrink-0 rounded-full text-[#9AA0A6] flex items-center justify-center"
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {askClear && (
        <ConfirmDialog
          title="알림을 모두 삭제하시겠습니까?"
          desc="삭제한 알림은 다시 볼 수 없어요."
          confirmLabel="삭제"
          danger
          onClose={() => setAskClear(false)}
          onConfirm={() => {
            clearNotifications()
            setAskClear(false)
          }}
        />
      )}
    </Background>
  )
}

export default NotificationsPage
