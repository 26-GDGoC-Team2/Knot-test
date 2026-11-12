import { useState } from "react"
import { useNavigate } from "react-router-dom"
import Background from "../components/Background"
import { TopBar, EmptyState } from "../components/ui"
import Icon from "../components/Icon"
import ConfirmDialog from "../components/ConfirmDialog"
import { useStore } from "../lib/store-context"
import { shortDate, isVisibleNoti, curlyQuotes, getPerson } from "../lib/helpers"

// 받침 있으면 "으로", 없거나 ㄹ받침·영어면 "로" (디자인으로 / FE로 / 기획으로)
function ro(word = "") {
  const c = word.charCodeAt(word.length - 1)
  if (c < 0xac00 || c > 0xd7a3) return `${word}로`
  const jong = (c - 0xac00) % 28
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`
}

// "방금" / "N분 전" / "N시간 전"(오늘) / "10.24"
function timeText(n) {
  if (!n.at) return shortDate(n.date)
  const min = Math.floor((Date.now() - new Date(n.at).getTime()) / 60000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  if (min < 24 * 60 && new Date(n.at).toDateString() === new Date().toDateString()) return `${Math.floor(min / 60)}시간 전`
  return shortDate(n.date)
}

// 묶음: 오늘 / 이번 주(7일 안) / 이전
function groupOf(n) {
  const days = Math.floor((new Date(new Date().toDateString()) - new Date(`${n.date}T00:00:00`)) / 86400000)
  return days <= 0 ? "오늘" : days < 7 ? "이번 주" : "이전"
}

// 알림 문구는 프론트가 정해요 (피그마 REQ-022). 종류 + 지원·제안 건(누가·어떤 역할) + 모집글 제목
// 지원 건을 못 찾으면 제목만, 글이 삭제됐으면 안내 문구
function notiView(n, post, app, user) {
  const title = post?.title
  const t = title ? `'${title}'` : "모집글"
  const nameOf = (id) => {
    const p = id ? getPerson(user, id) : null
    return p?.withdrawn ? "탈퇴한 회원" : p?.name
  }
  const sub = (s) => [s, timeText(n)].filter(Boolean).join(" · ")
  if (n.postId && !post) return { icon: "close", text: "삭제된 모집글의 알림이에요", sub: sub(""), gone: true }
  switch (n.type) {
    case "APPLICATION_RECEIVED": {
      const name = nameOf(app?.fromId)
      return { icon: "user", text: name && app?.role ? `${name}님이 내 모집글에 ${ro(app.role)} 지원했어요` : `${t}에 새 지원이 도착했어요`, sub: sub(name ? title : "") }
    }
    case "PROPOSAL_RECEIVED": {
      const name = nameOf(app?.fromId)
      return { icon: "send", text: name && app?.role ? `${name}님이 ${ro(app.role)} 팀 참여를 제안했어요` : `${t} 팀 참여 제안을 받았어요`, sub: sub(name ? title : "") }
    }
    case "APPLICATION_ACCEPTED":
      // 내가 보낸 제안을 부원이 수락 → 누가 수락했는지 / 내 지원이 수락 → 팀에 합류
      if (app?.type === "propose") return { icon: "check", text: `${nameOf(app.toId) ?? "부원"}님이 제안을 수락했어요`, sub: sub(title) }
      return { icon: "check", text: `${t} 팀에 합류했어요`, sub: sub("지원이 수락됐어요") }
    case "APPLICATION_REJECTED":
      if (app?.type === "propose") return { icon: "close", text: `${nameOf(app.toId) ?? "부원"}님이 제안을 거절했어요`, sub: sub(title) }
      return { icon: "close", text: `${t} 지원이 거절됐어요`, sub: sub("") }
    case "RECRUITMENT_NEW": {
      // 나와 맞는 이유: 겹치는 역할·관심 분야 (최대 3개)
      const roles = Object.keys(post?.roleCounts ?? {})
      const match = [...(user.roles ?? []).filter((r) => roles.includes(r)), ...(user.interests ?? []).filter((i) => (post?.interests ?? []).includes(i))].slice(0, 3)
      return { icon: "copy", text: title ? `나와 맞는 새 모집글: '${title}'` : "나와 맞는 새 모집글이 올라왔어요", sub: sub(match.length ? `${match.join(" · ")} 일치` : "") }
    }
    case "RECRUITMENT_CLOSED":
      return { icon: "close", text: `${t} 모집이 마감되어 지원이 종료됐어요`, sub: sub("") }
    case "ROLE_CHANGED": // 운영진 지정·해제 (문구는 서버가 줘요)
      return { icon: "lock", text: n.text, sub: sub("운영진 안내") }
    case "SYSTEM": // 수료 지정·취소 (문구는 서버가 줘요)
      return { icon: "trophy", text: n.text, sub: sub("운영진 안내") }
    default:
      return { icon: "bell", text: n.text, sub: sub("") }
  }
}

// 알림 목록 (REQ-022)
function NotificationsPage() {
  const navigate = useNavigate()
  const { user, notifications, applications, posts, markAllRead, markRead, removeNotification, clearNotifications } = useStore()
  const [askClear, setAskClear] = useState(false)

  // 최근 30일 + 수락이 취소된 매칭 알림은 안 보여요
  const list = notifications.filter((n) => isVisibleNoti(n, applications, posts))
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
        <EmptyState title="받은 알림이 없어요" desc="최근 30일 동안 받은 알림이 여기에 보여요" />
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-sub">최근 30일 알림{unread > 0 ? ` · 읽지 않음 ${unread}` : ""}</span>
            <button onClick={() => setAskClear(true)} className="text-xs text-sub underline underline-offset-2">
              전체 삭제
            </button>
          </div>

          {["오늘", "이번 주", "이전"].map((g) => {
            const items = list.filter((n) => groupOf(n) === g)
            if (items.length === 0) return null
            return (
              <section key={g} className="mb-4">
                <h2 className="text-xs text-sub mb-2 px-1">{g}</h2>
                <div className="flex flex-col gap-2">
                  {items.map((n) => {
                    const post = n.postId ? posts.find((p) => String(p.id) === String(n.postId)) : null
                    const app = n.appId ? applications.find((x) => String(x.id) === String(n.appId)) : null
                    const v = notiView(n, post, app, user)
                    return (
                      <div key={n.id} className="rounded-[22px] bg-white p-4 flex items-center gap-3">
                        {/* 누르면 읽음 처리하고 해당 화면으로 (삭제된 글은 이동 안 함) */}
                        <button
                          onClick={() => {
                            markRead(n.id)
                            if (!v.gone && n.link) navigate(n.link)
                          }}
                          className="flex-1 min-w-0 flex items-center gap-3 text-left"
                        >
                          <span
                            className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
                              n.read ? "bg-[#F1F3F4] text-[#3C4043]" : "bg-ink text-white"
                            }`}
                          >
                            <Icon name={v.icon} size={17} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className={`block text-sm font-semibold leading-snug ${v.gone ? "text-sub font-normal" : ""}`}>{curlyQuotes(v.text)}</span>
                            <span className="block text-xs text-sub mt-1 truncate">{v.sub}</span>
                          </span>
                          {!n.read && <span aria-label="읽지 않음" className="w-1.5 h-1.5 shrink-0 rounded-full bg-[#EA4335]"></span>}
                        </button>
                        <button
                          aria-label="이 알림 삭제"
                          onClick={() => removeNotification(n.id)}
                          className="w-7 h-7 -mr-1.5 shrink-0 rounded-full text-[#BDC1C6] flex items-center justify-center"
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </>
      )}

      {askClear && (
        <ConfirmDialog
          title="알림을 모두 삭제하시겠습니까?"
          desc="삭제한 알림은 다시 볼 수 없어요"
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
