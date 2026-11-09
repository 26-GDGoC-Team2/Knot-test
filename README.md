# Knot-test (시험 배포용)

정식 레포가 아니라 **팀 시험 배포용**입니다. 정식 코드는 `knot-backend`, `knot-web`에 있습니다.

- `backend/` : NestJS 백엔드 (A+B 통합본). Render 배포 시 Root Directory = `backend`
- `frontend/`: React(Vite) 프론트. Vercel 배포 시 Root Directory = `frontend`
- 비밀값(.env, 키, DB 주소)은 이 레포에 올리지 않고 호스팅 환경변수에 직접 입력합니다.
- AI 추천 로직은 AI팀 코드 합류 전이라 비어 있습니다.
