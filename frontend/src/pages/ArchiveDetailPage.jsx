import { Link, useNavigate, useParams } from "react-router-dom"
import Background from "../components/Background"
import Icon from "../components/Icon"
import { TopBar, EmptyState } from "../components/ui"
import { useStore } from "../lib/store-context"
import { ARCHIVE_TYPES, LINK_KINDS, ME, members as memberList } from "../data"
import { periodText, archiveMemberName, isMyArchive } from "../lib/archive"

// 링크 종류별 아이콘
const LINK_ICON = { github: "github", deploy: "globe", slides: "doc", etc: "link" }

// 주소에서 앞의 https:// 빼고 보여 주기
const prettyUrl = (url) => url.replace(/^https?:\/\//, "").replace(/\/$/, "")

// 아카이브 상세 (REQ-030)
function ArchiveDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, archives } = useStore()
  const a = archives.find((x) => x.id === id)

  if (!a) {
    return (
      <Background plain>
        <TopBar />
        <EmptyState title="프로젝트를 찾을 수 없어요" action={<Link to="/archive" className="underline">아카이브로</Link>} />
      </Background>
    )
  }

  const mine = isMyArchive(a, ME)

  return (
    <Background plain bottomSpace={false}>
      <header className="flex items-center justify-between">
        <button
          aria-label="뒤로"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/archive"))}
          className="w-11 h-11 rounded-full bg-white/65 border border-white flex items-center justify-center"
        >
          <Icon name="back" size={18} />
        </button>
        {mine && (
          <Link to={`/archive/${a.id}/edit`} className="h-10 px-3.5 rounded-full bg-white/70 border border-white text-[13px] flex items-center">
            수정
          </Link>
        )}
      </header>

      <div className="mt-4 flex flex-col gap-3.5">
        {/* 구분 · 기수 · 기간 · 제목 · 기술 */}
        <div className="flex flex-col gap-1.5 px-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[11px] font-medium px-[9px] py-[3px] rounded-full ${
                a.type === "gdgoc" ? "bg-ink text-white" : "bg-white border border-[#DADCE0]"
              }`}
            >
              {ARCHIVE_TYPES[a.type]}
            </span>
            <span className="text-xs text-sub">
              {[a.gen, periodText(a.start, a.end)].filter(Boolean).join(" · ")}
            </span>
          </div>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.6px] leading-snug">{a.title}</h1>
          <div className="flex gap-1 flex-wrap">
            {a.skills.map((s) => (
              <span key={s} className="text-[11px] px-[9px] py-1 rounded-full bg-ink text-white">{s}</span>
            ))}
          </div>
        </div>

        {/* 설명 */}
        <section className="rounded-3xl bg-white/90 border border-white px-[18px] py-4 flex flex-col gap-2">
          <span className="text-[13px] font-semibold">프로젝트 설명</span>
          <p className="text-sm leading-[1.65] text-[#3C4043] whitespace-pre-line">{a.description}</p>
        </section>

        {/* 결과물 링크 */}
        {a.links.length > 0 && (
          <section className="rounded-3xl bg-white/90 border border-white px-3.5 pt-4 pb-3.5 flex flex-col gap-2">
            <span className="pl-1 text-[13px] font-semibold">결과물</span>
            {a.links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="h-14 rounded-[18px] bg-[#F6F7F9] px-3.5 flex items-center gap-3"
              >
                <span className="w-[34px] h-[34px] shrink-0 rounded-full bg-white flex items-center justify-center">
                  <Icon name={LINK_ICON[l.kind] ?? "link"} size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{l.label || LINK_KINDS[l.kind]}</span>
                  <span className="block text-[11px] text-sub truncate">{prettyUrl(l.url)}</span>
                </span>
                <Icon name="external" size={14} className="text-[#9AA0A6]" />
              </a>
            ))}
          </section>
        )}

        {/* 참여 부원 */}
        <section className="rounded-3xl bg-white/90 border border-white px-4 pt-3.5 pb-2.5 flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold mb-1">참여 부원 {a.members.length}</span>
          {a.members.map((m, i) => {
            const name = archiveMemberName(user, m)
            if (m.external) {
              return (
                <div key={i} className="flex items-center gap-2.5 py-1.5 px-0.5">
                  <span className="w-9 h-9 shrink-0 rounded-full border-[1.5px] border-dashed border-[#BDC1C6] text-[13px] text-[#6B7075] flex items-center justify-center">
                    {name.slice(0, 1)}
                  </span>
                  <span className="flex-1 text-sm text-[#3C4043]">
                    {name} <span className="text-[11px] text-[#6B7075]">· 외부 · {m.role}</span>
                  </span>
                </div>
              )
            }
            // 탈퇴한 부원: 부원 목록에 없으면 탈퇴한 걸로 봐요 → 이름만 남기고 프로필로 가지 않아요 (회의 결정)
            if (m.id !== ME && !memberList.some((x) => x.id === m.id && !x.withdrawn)) {
              return (
                <div key={i} className="flex items-center gap-2.5 py-1.5 px-0.5">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-[#EDEFF2] text-[13px] font-semibold text-[#9AA0A6] flex items-center justify-center">
                    {name.slice(0, 1)}
                  </span>
                  <span className="flex-1 text-sm font-medium text-[#6B7075]">
                    {name}
                    <span className="text-[11px] font-normal text-sub"> (탈퇴한 회원) · {m.role}</span>
                  </span>
                </div>
              )
            }
            return (
              <Link key={i} to={m.id === ME ? "/me" : `/members/${m.id}`} className="flex items-center gap-2.5 py-1.5 px-0.5">
                <span className="w-9 h-9 shrink-0 rounded-full bg-[#EDEFF2] text-[13px] font-semibold flex items-center justify-center">
                  {name.slice(0, 1)}
                </span>
                <span className="flex-1 text-sm font-medium">
                  {name}
                  {m.id === ME && <span className="text-[11px] text-sub font-normal"> (나)</span>}
                  <span className="text-[11px] font-normal text-sub"> · {m.role}</span>
                </span>
                <Icon name="next" size={14} className="text-[#9AA0A6]" />
              </Link>
            )
          })}
        </section>
      </div>
    </Background>
  )
}

export default ArchiveDetailPage
