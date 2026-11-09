// DB 접속 설정 (환경 변수에서만 읽음)
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('환경 변수 DATABASE_URL이 설정되지 않았습니다.');
  return url;
}
