import { extractIx, normalizeWevityLink } from './wevity.util';

const CANON = 'https://www.wevity.com?c=find&s=1&gub=1&cidx=20&gbn=view&ix=110179';

describe('wevity.util', () => {
  it('링크 형식이 달라도 같은 ix는 같은 URL로 통일된다', () => {
    const forms = [
      '/?c=find&s=1&gbn=view&ix=110179',
      '?c=find&s=1&gub=1&cidx=20&gbn=view&gp=1&ix=110179',
      'https://www.wevity.com?c=find&s=1&gub=1&cidx=20&gbn=view&gp=2&ix=110179',
      'https://www.wevity.com/?c=find&s=1&gbn=view&ix=110179&gp=3',
    ];
    for (const f of forms) expect(normalizeWevityLink(f)).toEqual({ ix: '110179', url: CANON });
  });

  it('ix가 없거나 상세 링크가 아니면 null', () => {
    expect(normalizeWevityLink('?c=find&s=1&gbn=view')).toBeNull();
    expect(normalizeWevityLink('?c=find&s=1&ix=1')).toBeNull(); // gbn=view 아님
    expect(normalizeWevityLink('?c=find&gbn=view&ix=abc')).toBeNull();
    expect(normalizeWevityLink(undefined)).toBeNull();
    expect(normalizeWevityLink(null)).toBeNull();
  });

  it('ix만 정확히 뽑는다 (다른 파라미터의 숫자와 헷갈리지 않는다)', () => {
    expect(extractIx('?gp=2&ix=55&x=9')).toBe('55');
    expect(extractIx('?gix=7')).toBeNull();
  });
});
