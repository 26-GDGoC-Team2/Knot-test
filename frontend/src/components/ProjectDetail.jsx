import Icon from "./Icon"
import { ProjectBadge } from "./ui"
import { isWebLink } from "../lib/helpers"

// 프로젝트 링크 이름: 주소를 보고 어떤 사이트인지 붙여요 (링크 칸이 하나라 종류를 따로 받지 않아요)
function linkLabel(url) {
  let host = ""
  try {
    host = new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return { label: "링크 열기", host: "" }
  }
  if (host === "github.com" || host.endsWith(".github.io")) return { label: "GitHub에서 보기", host: "" }
  if (host.includes("notion.so") || host.includes("notion.site")) return { label: "Notion에서 보기", host: "" }
  if (host.includes("figma.com")) return { label: "Figma에서 보기", host: "" }
  return { label: "링크 열기", host } // 그 외: 버튼 아래에 주소를 작게 보여 줘요
}

// 프로젝트 경험 상세 내용: 이름 · 종류 · 기간 · 역할 · 기술 · 설명 · 링크
function ProjectDetail({ project }) {
  const link = project.link && isWebLink(project.link) ? linkLabel(project.link) : null
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold leading-snug break-keep">{project.name}</h2>
        <span className="shrink-0 whitespace-nowrap"><ProjectBadge type={project.type} /></span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-[#F6F7F9] p-3">
          <p className="text-[11px] text-sub">기간</p>
          <p className="text-sm font-semibold">{project.period || "-"}</p>
        </div>
        <div className="rounded-2xl bg-[#F6F7F9] p-3">
          <p className="text-[11px] text-sub">역할</p>
          <p className="text-sm font-semibold">{project.role || "-"}</p>
        </div>
      </div>
      {project.skills.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold">사용 기술</p>
          <div className="flex flex-wrap gap-1.5">
            {project.skills.map((s) => (
              <span key={s} className="h-[30px] px-3 rounded-full bg-[#F1F3F4] text-xs flex items-center">{s}</span>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold">설명</p>
        <p className="text-sm text-[#3C4043] leading-relaxed whitespace-pre-line break-keep">{project.description || "등록된 설명이 없어요."}</p>
      </div>
      {link && (
        <div className="flex flex-col gap-1.5">
          <a
            href={project.link}
            target="_blank"
            rel="noreferrer"
            className="h-12 rounded-full border border-line bg-white flex items-center justify-center gap-1.5 text-sm font-medium"
          >
            <Icon name={link.label.startsWith("GitHub") ? "github" : "link"} size={16} /> {link.label}
          </a>
          {link.host && <p className="text-center text-xs text-sub truncate">{link.host}</p>}
        </div>
      )}
    </>
  )
}

export default ProjectDetail
