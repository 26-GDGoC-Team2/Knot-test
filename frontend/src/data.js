// ─────────────────────────────────────────────
// 임시 데이터 (백엔드 API가 나오면 교체)
// ─────────────────────────────────────────────

export const ME = "me"

// 테스트용 가입 코드 (실제로는 운영진이 발급)
export const JOIN_CODE = "GDGOC2026"

// 한 줄 메시지 최대 글자 수 (정의서 미정 → 회의 후 수정)
export const MESSAGE_MAX = 50

export const ROLES = ["기획", "디자인", "FE", "BE"]

// 기술 스택·관심 분야 기본 목록 (정의서 미정 → 회의 후 수정)
export const SKILLS = [
  "React", "TypeScript", "Next.js", "Figma", "Design System", "UX Research",
  "Python", "PyTorch", "Transformers", "FAISS", "Whisper", "librosa",
  "Pandas", "SQL", "XGBoost", "LightGBM", "Tableau",
  "FastAPI", "Spring", "PostgreSQL", "Redis", "Docker", "AWS",
  "Flutter", "Kotlin", "Swift", "Firebase",
]

export const INTERESTS = [
  "AI/ML", "LLM/생성형AI", "NLP", "음성AI", "검색/추천", "데이터분석",
  "금융/핀테크", "커머스", "교육", "커뮤니티", "동아리서비스",
  "UX/UI", "프론트엔드", "백엔드", "AI서비스", "앱",
]

export const PROJECT_TYPES = ["동아리 프로젝트", "동아리원 팀", "본인 입력"]

// 부원 (내 정보는 store의 user에 따로 있음)
export const members = [
  {
    id: "m1", name: "최하린", roles: ["FE", "디자인"], completedGens: ["4기", "5기", "6기"],
    skills: ["React", "TypeScript", "Figma"], interests: ["UX/UI", "프론트엔드", "동아리서비스"],
    available: true, availableFrom: "2026-11-01", github: "https://github.com/harin-choi",
    bio: "사용자가 편하게 쓰는 화면을 만드는 게 좋아요. 요즘은 AI 서비스 UI에 관심이 많아요.",
    projects: [
      { id: "pj1", name: "동아리 출석 체크 웹", type: "동아리 프로젝트", period: "2026.03–06", role: "FE", skills: ["React"], isPublic: true },
      { id: "pj2", name: "중고 교재 거래 앱", type: "동아리원 팀", period: "2025.09–12", role: "FE", skills: ["Next.js"], isPublic: true },
    ],
  },
  {
    id: "m2", name: "한서준", roles: ["BE"], completedGens: ["6기"],
    skills: ["Python", "PyTorch", "Transformers", "FAISS"], interests: ["AI/ML", "LLM/생성형AI", "NLP"],
    available: true, availableFrom: "2026-10-30", github: "https://github.com/seojun-han",
    bio: "이미지 분류와 RAG 프로젝트를 해 봤어요. 실제로 쓰이는 AI 서비스를 만들고 싶어요.",
    projects: [
      { id: "pj3", name: "강의 요약 챗봇", type: "본인 입력", period: "2026.01–02", role: "BE", skills: ["Transformers", "FAISS"], isPublic: true },
    ],
  },
  {
    id: "m3", name: "오세린", roles: ["디자인"], completedGens: [],
    skills: ["Figma", "Design System", "UX Research"], interests: ["UX/UI", "커머스", "커뮤니티"],
    available: true, availableFrom: "2026-11-03", github: "",
    bio: "서비스 흐름을 정리하고 화면으로 풀어내는 걸 좋아해요.",
    projects: [],
  },
  {
    id: "m4", name: "박서연", roles: ["기획", "BE"], completedGens: ["5기", "6기"],
    skills: ["Spring", "PostgreSQL", "SQL"], interests: ["교육", "데이터분석", "백엔드"],
    available: true, availableFrom: "2026-11-01", github: "https://github.com/seoyeon-park",
    bio: "기획부터 API까지 전체 흐름을 보는 역할을 주로 맡아요.",
    projects: [
      { id: "pj4", name: "스터디 매칭 서비스", type: "동아리 프로젝트", period: "2026.03–06", role: "기획", skills: ["Spring"], isPublic: true },
    ],
  },
  {
    id: "m5", name: "이도윤", roles: ["BE"], completedGens: ["6기"],
    skills: ["FastAPI", "PostgreSQL", "Docker", "Redis"], interests: ["백엔드", "AI서비스"],
    available: true, availableFrom: "2026-11-01", github: "https://github.com/doyun-lee",
    bio: "빠르게 API 서버를 세우는 데 자신 있어요.",
    projects: [],
  },
  {
    id: "m6", name: "정민호", roles: ["FE"], completedGens: [],
    skills: ["Flutter", "Firebase", "Kotlin"], interests: ["앱", "금융/핀테크"],
    available: true, availableFrom: "2026-11-05", github: "",
    bio: "Flutter로 앱 두 개를 출시해 봤어요.",
    projects: [],
  },
  {
    id: "m7", name: "강수아", roles: ["기획"], completedGens: [],
    skills: ["Python", "SQL", "Pandas", "XGBoost"], interests: ["데이터분석", "금융/핀테크", "AI/ML"],
    available: true, availableFrom: "2026-11-01", github: "https://github.com/sua-kang",
    bio: "데이터 분석 공모전에 여러 번 참가했어요.",
    projects: [],
  },
  {
    id: "m8", name: "윤태경", roles: ["FE"], completedGens: ["6기"],
    skills: ["React", "Next.js", "TypeScript"], interests: ["프론트엔드", "커뮤니티"],
    available: false, availableFrom: "", github: "https://github.com/taekyung-yoon",
    bio: "이번 학기는 바빠서 다음 학기부터 참여할 수 있어요.",
    projects: [],
  },
]

const OPEN_CHAT = "https://open.kakao.com/o/example" // 문의용 (누구나)
// roleSkills: 역할별 필수·우대 기술 / requiredSkills·preferredSkills: 모든 역할을 합친 목록 (카드·검색·추천용)
// 역할별 인원(roleCounts)은 팀장 자리까지 포함해요 (예: 팀장 FE + FE 1명 모집 → FE: 2)
const TEAM_CHAT = "https://open.kakao.com/o/team-example" // 팀 채팅방 (모집 끝나면 확정 팀원에게만)

// 모집글 (recruitment_posts.csv 변환 + 작성자·팀·등록일 추가)
export const posts = [
  { id: "P001", authorId: "m7", createdAt: "2026-10-24", title: "금융 이상거래 탐지 공모전 팀원 모집", description: "카드 거래 데이터를 이용해 이상거래 탐지 모델을 개발하는 금융 AI 공모전에 함께할 팀원을 모집합니다.", leaderRole: "기획", desiredRoles: ["BE"], roleSkills: { BE: { required: ["Python"], preferred: ["SQL", "Pandas", "XGBoost"] } }, requiredSkills: ["Python"], preferredSkills: ["SQL", "Pandas", "XGBoost"], interests: ["금융/핀테크", "AI/ML"], startDate: "2026-11-05", endDate: "2026-12-15", roleCounts: { BE: 2, 기획: 1 }, recruitCount: 3, team: [], teamRoles: {}, closed: true, openChat: OPEN_CHAT, teamChat: TEAM_CHAT },
  { id: "P002", authorId: "m2", createdAt: "2026-10-23", title: "RAG 기반 동아리 Q&A 서비스", description: "동아리 문서와 공지를 검색해 답변하는 RAG 기반 Q&A 서비스를 함께 개발할 백엔드 팀원을 모집합니다.", leaderRole: "BE", desiredRoles: ["BE"], roleSkills: { BE: { required: ["Python"], preferred: ["FastAPI", "FAISS", "Transformers"] } }, requiredSkills: ["Python"], preferredSkills: ["FastAPI", "FAISS", "Transformers"], interests: ["LLM/생성형AI", "동아리서비스"], startDate: "2026-11-01", endDate: "2026-12-10", roleCounts: { BE: 3 }, recruitCount: 3, team: ["m5"], teamRoles: { m5: "BE" }, closed: false, openChat: OPEN_CHAT, teamChat: TEAM_CHAT },
  { id: "P003", authorId: ME, createdAt: "2026-10-22", title: "GDGoC 활동 대시보드 제작", description: "세션과 프로젝트 현황을 한눈에 볼 수 있는 반응형 웹 대시보드의 디자인과 프론트엔드를 개발합니다.", leaderRole: "FE", desiredRoles: ["FE", "디자인"], roleSkills: { FE: { required: ["React"], preferred: ["TypeScript", "Next.js"] }, 디자인: { required: ["Figma"], preferred: [] } }, requiredSkills: ["React", "Figma"], preferredSkills: ["TypeScript", "Next.js"], interests: ["동아리서비스", "UX/UI", "프론트엔드"], startDate: "2026-11-01", endDate: "2026-12-05", roleCounts: { FE: 2, 디자인: 1 }, recruitCount: 3, team: [], teamRoles: {}, closed: false, openChat: OPEN_CHAT, teamChat: TEAM_CHAT },
  { id: "P004", authorId: "m5", createdAt: "2026-10-21", title: "커머스 개인화 추천 서비스", description: "사용자 행동 데이터를 분석해 상품 추천 순위를 만들고 API로 제공하는 커머스 추천 프로젝트입니다.", leaderRole: "BE", desiredRoles: ["BE"], roleSkills: { BE: { required: ["Python", "SQL"], preferred: ["LightGBM", "FastAPI", "PostgreSQL"] } }, requiredSkills: ["Python", "SQL"], preferredSkills: ["LightGBM", "FastAPI", "PostgreSQL"], interests: ["커머스", "검색/추천", "데이터분석"], startDate: "2026-11-10", endDate: "2026-12-20", roleCounts: { BE: 3 }, recruitCount: 3, team: ["m7"], teamRoles: { m7: "BE" }, closed: false, openChat: OPEN_CHAT, teamChat: TEAM_CHAT },
  { id: "P005", authorId: "m6", createdAt: "2026-10-20", title: "모바일 습관관리 앱 팀원 모집", description: "습관 기록과 알림 기능을 제공하는 모바일 앱을 제작합니다. 앱 화면 개발과 모바일 UX 디자인 경험자를 찾습니다.", leaderRole: "FE", desiredRoles: ["FE", "디자인"], roleSkills: { FE: { required: ["Firebase"], preferred: ["Flutter", "Kotlin", "Swift"] }, 디자인: { required: ["Figma"], preferred: [] } }, requiredSkills: ["Firebase", "Figma"], preferredSkills: ["Flutter", "Kotlin", "Swift"], interests: ["앱", "UX/UI"], startDate: "2026-11-08", endDate: "2026-12-20", roleCounts: { FE: 2, 디자인: 1 }, recruitCount: 3, team: [], teamRoles: {}, closed: false, openChat: OPEN_CHAT, teamChat: TEAM_CHAT },
  { id: "P006", authorId: "m4", createdAt: "2026-10-19", title: "교육 데이터 분석 대시보드", description: "학습 데이터를 분석하고 주요 지표를 시각화하는 교육 데이터 대시보드를 개발합니다.", leaderRole: "기획", desiredRoles: ["BE", "FE", "기획"], roleSkills: { BE: { required: ["Python"], preferred: ["SQL"] }, FE: { required: ["React"], preferred: [] }, 기획: { required: ["Tableau"], preferred: [] } }, requiredSkills: ["Python", "React", "Tableau"], preferredSkills: ["SQL"], interests: ["데이터분석", "교육", "프론트엔드"], startDate: "2026-11-03", endDate: "2026-12-10", roleCounts: { BE: 1, FE: 1, 기획: 2 }, recruitCount: 4, team: [], teamRoles: {}, closed: false, openChat: OPEN_CHAT, teamChat: TEAM_CHAT },
  { id: "P007", authorId: "m5", createdAt: "2026-10-18", title: "해커톤 백엔드 API 서버 개발", description: "짧은 기간 안에 인증·사용자·핵심 기능 API를 구축할 백엔드 팀원을 모집합니다.", leaderRole: "BE", desiredRoles: ["BE"], roleSkills: { BE: { required: ["FastAPI", "PostgreSQL"], preferred: ["Docker", "Redis", "AWS"] } }, requiredSkills: ["FastAPI", "PostgreSQL"], preferredSkills: ["Docker", "Redis", "AWS"], interests: ["백엔드", "AI서비스"], startDate: "2026-11-02", endDate: "2026-11-20", roleCounts: { BE: 2 }, recruitCount: 2, team: ["m4"], teamRoles: { m4: "BE" }, closed: false, openChat: OPEN_CHAT, teamChat: TEAM_CHAT },
  { id: "P008", authorId: "m3", createdAt: "2026-10-17", title: "커뮤니티 서비스 UX 리디자인", description: "동아리 커뮤니티 서비스의 사용자 흐름을 점검하고 모바일·웹 화면을 리디자인합니다.", leaderRole: "디자인", desiredRoles: ["디자인", "FE"], roleSkills: { 디자인: { required: ["Figma"], preferred: ["UX Research", "Design System"] }, FE: { required: ["React"], preferred: [] } }, requiredSkills: ["Figma", "React"], preferredSkills: ["UX Research", "Design System"], interests: ["UX/UI", "커뮤니티", "프론트엔드"], startDate: "2026-11-04", endDate: "2026-12-01", roleCounts: { 디자인: 2, FE: 1 }, recruitCount: 3, team: [ME], teamRoles: { [ME]: "FE" }, closed: false, openChat: OPEN_CHAT, teamChat: TEAM_CHAT },
  { id: "P009", authorId: "m2", createdAt: "2026-10-16", title: "실시간 음성 상담 AI 프로젝트", description: "음성 인식과 분류 모델을 활용해 상담 내용을 분석하는 AI 서비스를 개발합니다.", leaderRole: "BE", desiredRoles: ["BE"], roleSkills: { BE: { required: ["Python", "PyTorch"], preferred: ["Whisper", "librosa", "FastAPI"] } }, requiredSkills: ["Python", "PyTorch"], preferredSkills: ["Whisper", "librosa", "FastAPI"], interests: ["음성AI", "NLP", "AI/ML"], startDate: "2026-11-06", endDate: "2026-12-20", roleCounts: { BE: 3 }, recruitCount: 3, team: [], teamRoles: {}, closed: false, openChat: OPEN_CHAT, teamChat: TEAM_CHAT },
  { id: "P010", authorId: "m6", createdAt: "2026-10-15", title: "핀테크 모바일 서비스 팀원 모집", description: "개인 자산과 소비 기록을 보여주는 핀테크 모바일 서비스를 제작합니다. 프론트·백엔드·기획 역할을 모집합니다.", leaderRole: "FE", desiredRoles: ["FE", "BE", "기획"], roleSkills: { FE: { required: ["Flutter"], preferred: ["Swift"] }, BE: { required: ["Firebase"], preferred: ["Spring"] }, 기획: { required: ["Figma"], preferred: [] } }, requiredSkills: ["Flutter", "Firebase", "Figma"], preferredSkills: ["Swift", "Spring"], interests: ["금융/핀테크", "앱"], startDate: "2026-11-05", endDate: "2026-12-20", roleCounts: { FE: 2, BE: 1, 기획: 1 }, recruitCount: 4, team: [], teamRoles: {}, closed: false, openChat: OPEN_CHAT, teamChat: TEAM_CHAT },
]

// 지원(apply)·제안(propose) 내역
// apply: fromId가 postId에 지원 / propose: fromId(작성자)가 toId에게 제안
export const applications = [
  { id: "a1", type: "apply", postId: "P003", fromId: "m1", toId: ME, role: "FE", message: "React로 대시보드 만들어 봤어요!", date: "2026-10-25", status: "pending" },
  { id: "a2", type: "apply", postId: "P003", fromId: "m3", toId: ME, role: "디자인", message: "대시보드 UX 같이 고민하고 싶어요.", date: "2026-10-26", status: "pending" },
  { id: "a3", type: "propose", postId: "P006", fromId: "m4", toId: ME, role: "FE", message: "대시보드 화면 같이 만들어요!", date: "2026-10-26", status: "pending" },
  // 내가 보낸 지원이 수락된 예시 (알림 n0과 연결)
  { id: "a4", type: "apply", postId: "P008", fromId: ME, toId: "m3", role: "FE", message: "React로 화면 구현 맡고 싶어요!", date: "2026-10-27", status: "accepted" },
  // 내가 보낸 지원이 거절된 예시 (알림 n5와 연결)
  { id: "a5", type: "apply", postId: "P010", fromId: ME, toId: "m6", role: "FE", message: "모바일 화면 구현 맡고 싶어요!", date: "2026-10-28", status: "rejected" },
]

export const notifications = [
  { id: "n5", text: "'핀테크 모바일 서비스' 모집에 매칭되지 않았어요", date: "2026-10-29", read: false, link: "/activity?box=sent" },
  { id: "n0", text: "오세린님 팀과 한 팀이 됐어요! 'UX 리디자인'에 FE로 함께해요", date: "2026-10-27", read: false, link: "/match/a4" },
  { id: "n1", text: "오세린님이 'GDGoC 활동 대시보드 제작'에 지원했어요", date: "2026-10-26", read: false, link: "/posts/P003" },
  { id: "n2", text: "박서연님이 '교육 데이터 분석 대시보드' 팀 참여를 제안했어요", date: "2026-10-26", read: false, link: "/activity" },
  { id: "n3", text: "관심 분야에 맞는 새 모집글: 'GDGoC 활동 대시보드 제작'", date: "2026-10-22", read: true, link: "/posts/P003" },
]

// ─────────────────────────────────────────────
// 프로젝트 아카이브 (REQ-030): 이전 기수 프로젝트 기록
// type: "gdgoc"(GDGoC 프로젝트) | "external"(외부 프로젝트)
// members: 부원은 id, 외부 인원은 name + external
// ─────────────────────────────────────────────
export const ARCHIVE_TYPES = { gdgoc: "GDGoC 프로젝트", external: "외부 프로젝트" }
export const GENERATIONS = ["7기", "6기", "5기"]
export const LINK_KINDS = { github: "GitHub", deploy: "배포 사이트", slides: "발표 자료", etc: "기타" }

export const archives = [
  {
    id: "A1", type: "gdgoc", gen: "7기", start: "2026-03", end: "2026-06", createdBy: ME,
    title: "동아리 출석 체크 웹",
    description: "세션마다 QR로 출석을 체크하고, 운영진이 출석 현황을 한눈에 볼 수 있는 웹을 만들었어요. 다음 기수도 그대로 쓰고 있어요.",
    skills: ["React", "Firebase"],
    members: [{ id: ME, role: "FE" }, { id: "m4", role: "기획" }, { id: "m1", role: "FE" }, { id: "m5", role: "BE" }, { id: "m3", role: "디자인" }],
    links: [{ kind: "github", url: "https://github.com/gdgoc-attendance" }, { kind: "deploy", url: "https://attendance-demo.vercel.app" }],
  },
  {
    id: "A2", type: "external", gen: "7기", start: "2026-05", end: "2026-07", createdBy: "m7",
    title: "금융 이상거래 탐지 공모전",
    description: "카드 결제 기록에서 평소와 다른 거래를 찾아내는 모델을 만들었어요. 데이터 불균형을 줄이는 방법을 실험했고, 결과를 웹 대시보드로 보여 줬어요. 본선 장려상을 받았어요.",
    skills: ["Python", "PyTorch", "FastAPI"],
    members: [{ id: "m7", role: "BE" }, { id: "m2", role: "BE" }, { name: "김도현", role: "BE", external: true }],
    links: [
      { kind: "github", url: "https://github.com/fraud-detect-team" },
      { kind: "deploy", url: "https://fraud-demo.vercel.app" },
      { kind: "slides", url: "https://example.com/final-slides.pdf" },
    ],
  },
  {
    id: "A3", type: "external", gen: "6기", start: "2025-09", end: "2025-12", createdBy: "m3",
    title: "캠퍼스 굿즈 쇼핑몰",
    description: "학과 굿즈를 미리 주문받고 수령 일정을 안내하는 쇼핑몰이에요. 결제 대신 계좌 이체 확인 흐름을 만들었어요.",
    skills: ["Next.js", "Spring"],
    members: [{ id: "m3", role: "디자인" }, { id: "m5", role: "BE" }, { id: "m8", role: "FE" }],
    links: [{ kind: "github", url: "https://github.com/campus-goods" }],
  },
  {
    id: "A4", type: "gdgoc", gen: "6기", start: "2025-04", end: "2025-06", createdBy: "m8",
    title: "학과 공지 대시보드",
    description: "흩어져 있던 학과 공지를 한곳에 모아 보여 주고, 관심 키워드가 올라오면 알려 주는 대시보드예요.",
    skills: ["React", "TypeScript"],
    members: [{ id: "m8", role: "FE" }, { id: "m3", role: "디자인" }, { id: "m4", role: "BE" }, { id: "m1", role: "FE" }, { id: "m2", role: "BE" }],
    links: [{ kind: "github", url: "https://github.com/notice-dashboard" }, { kind: "slides", url: "https://example.com/notice.pdf" }],
  },
]

// ─────────────────────────────────────────────
// 공모전 (REQ-033): 공모전 사이트에서 매일 오전 9시에 자동으로 모아 오는 목록 (지금은 예시)
// category는 필터 칩, url은 원문 주소
// ─────────────────────────────────────────────
export const CONTEST_CATEGORIES = ["AI/ML", "앱", "UX/UI", "핀테크", "데이터"]

export const contests = [
  { id: "C1", category: "AI/ML", title: "대학생 AI 서비스 아이디어 공모전", host: "○○재단", start: "2026-11-02", end: "2026-11-20", collectedAt: "2026-11-02", url: "https://example.com/contest/1", interest: "AI/ML" },
  { id: "C2", category: "앱", title: "캠퍼스 문제 해결 해커톤", host: "○○대학교 창업센터", start: "2026-10-20", end: "2026-11-05", collectedAt: "2026-10-20", url: "https://example.com/contest/2", interest: "앱" },
  { id: "C3", category: "UX/UI", title: "공공데이터 활용 UX 챌린지", host: "○○진흥원", start: "2026-11-01", end: "2026-12-01", collectedAt: "2026-11-01", url: "https://example.com/contest/3", interest: "UX/UI" },
  { id: "C4", category: "핀테크", title: "금융 데이터 분석 경진대회", host: "○○은행", start: "2026-10-28", end: "2026-11-14", collectedAt: "2026-10-28", url: "https://example.com/contest/4", interest: "금융/핀테크" },
  { id: "C5", category: "데이터", title: "교육 데이터 시각화 공모전", host: "○○교육청", start: "2026-11-03", end: "2026-12-10", collectedAt: "2026-11-03", url: "https://example.com/contest/5", interest: "데이터분석" },
  { id: "C6", category: "AI/ML", title: "생성형 AI 활용 서비스 해커톤", host: "○○테크", start: "2026-10-25", end: "2026-11-09", collectedAt: "2026-10-25", url: "https://example.com/contest/6", interest: "LLM/생성형AI" },
]
