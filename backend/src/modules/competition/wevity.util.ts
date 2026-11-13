// 위비티 링크 정규화 (순수 함수만 둔다)

const BASE_URL = 'https://www.wevity.com';

// 같은 공모전은 항상 같은 URL로 저장해야 source_url UNIQUE 기준으로 중복이 막힌다.
// 기존 DB에 가장 많이 쌓인 형식(gub=1&cidx=20)에 맞춘다
const CANONICAL_PREFIX = `${BASE_URL}?c=find&s=1&gub=1&cidx=20&gbn=view&ix=`;

// 링크에서 공모전 고유 번호(ix)를 뽑는다. 상단 노출·일반 목록 등 링크 형식이 달라도 ix는 같다
export function extractIx(href: string | null | undefined): string | null {
  if (typeof href !== 'string') return null;
  const m = href.match(/[?&]ix=(\d{1,12})(?:&|#|$)/);
  return m ? m[1] : null;
}

// 상세 링크 → { ix, url }. 공모전 상세가 아니거나 ix가 없으면 null (건너뛴다)
export function normalizeWevityLink(href: string | null | undefined): { ix: string; url: string } | null {
  if (typeof href !== 'string' || !href.includes('gbn=view')) return null;
  const ix = extractIx(href);
  if (!ix) return null;
  return { ix, url: `${CANONICAL_PREFIX}${ix}` };
}
