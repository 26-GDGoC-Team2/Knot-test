import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_PAGE_SIZE, PageRequest, PageResponse } from './pagination';

const parse = (plain: object) => plainToInstance(PageRequest, plain);

describe('PageRequest', () => {
  it('기본값은 page=1, size=20', async () => {
    const r = parse({});
    expect(await validate(r)).toHaveLength(0);
    expect([r.page, r.size, r.offset, r.limit]).toEqual([1, 20, 0, 20]);
  });

  it('쿼리스트링 문자열 숫자를 숫자로 변환하고 offset을 계산', async () => {
    const r = parse({ page: '3', size: '10' });
    expect(await validate(r)).toHaveLength(0);
    expect([r.page, r.size, r.offset]).toEqual([3, 10, 20]);
  });

  it.each([
    [{ page: '0' }],
    [{ page: '-1' }],
    [{ page: 'abc' }],
    [{ size: '0' }],
    [{ size: String(MAX_PAGE_SIZE + 1) }],
    [{ size: '1.5' }],
    [{ sortDir: 'up' }],
  ])('잘못된 값 %j 은 검증 실패', async (plain) => {
    expect((await validate(parse(plain))).length).toBeGreaterThan(0);
  });

  it('size 최대값은 허용', async () => {
    expect(await validate(parse({ size: String(MAX_PAGE_SIZE) }))).toHaveLength(0);
  });

  describe('resolveSort', () => {
    const allowed = { createdAt: 'created_at', name: 'name' };
    const fallback = { column: 'created_at', direction: 'desc' as const };

    it('정렬 미지정이면 기본값', () => {
      expect(parse({}).resolveSort(allowed, fallback)).toEqual(fallback);
    });

    it('허용 목록의 필드는 DB 컬럼으로 변환', () => {
      expect(parse({ sortBy: 'createdAt', sortDir: 'asc' }).resolveSort(allowed, fallback)).toEqual({
        column: 'created_at',
        direction: 'asc',
      });
    });

    it('허용되지 않은 필드는 400 (SQL 인젝션 방어)', () => {
      expect(() => parse({ sortBy: 'password; DROP TABLE users' }).resolveSort(allowed, fallback)).toThrow(
        expect.objectContaining({ status: 400 }),
      );
    });

    it('Object 프로토타입 키(constructor 등)도 거부', () => {
      expect(() => parse({ sortBy: 'constructor' }).resolveSort(allowed, fallback)).toThrow(
        expect.objectContaining({ status: 400 }),
      );
      expect(() => parse({ sortBy: '__proto__' }).resolveSort(allowed, fallback)).toThrow(
        expect.objectContaining({ status: 400 }),
      );
    });
  });
});

describe('PageResponse', () => {
  it('totalPages를 올림 계산', () => {
    const res = PageResponse.of(['a'], 41, { page: 1, size: 20 });
    expect(res).toMatchObject({ items: ['a'], total: 41, page: 1, size: 20, totalPages: 3 });
  });

  it('결과가 없으면 totalPages 0', () => {
    expect(PageResponse.of([], 0, { page: 1, size: 20 }).totalPages).toBe(0);
  });

  it('음수 total은 0으로 보정', () => {
    expect(PageResponse.of([], -5, { page: 1, size: 20 }).total).toBe(0);
  });
});
