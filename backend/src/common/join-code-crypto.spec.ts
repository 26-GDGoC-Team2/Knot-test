import { randomBytes } from 'node:crypto';
import { decryptJoinCode, encryptJoinCode, safeEqual } from './join-code-crypto';

describe('join-code-crypto', () => {
  const key = randomBytes(32);

  it('암호화한 값을 같은 키로 복호화하면 원문이 나온다', () => {
    expect(decryptJoinCode(encryptJoinCode('KNOT-2026', key), key)).toBe('KNOT-2026');
  });

  it('같은 원문도 매번 다른 암호문이 나온다 (IV 무작위)', () => {
    expect(encryptJoinCode('KNOT-2026', key)).not.toBe(encryptJoinCode('KNOT-2026', key));
  });

  it('암호문에 원문이 그대로 들어있지 않다', () => {
    expect(Buffer.from(encryptJoinCode('KNOT-2026', key), 'base64').toString('utf8')).not.toContain('KNOT-2026');
  });

  it('다른 키로는 복호화에 실패한다', () => {
    expect(() => decryptJoinCode(encryptJoinCode('KNOT-2026', key), randomBytes(32))).toThrow();
  });

  it('암호문이 변조되면 복호화에 실패한다', () => {
    const buf = Buffer.from(encryptJoinCode('KNOT-2026', key), 'base64');
    buf[buf.length - 1] ^= 1;
    expect(() => decryptJoinCode(buf.toString('base64'), key)).toThrow();
  });

  it('너무 짧은 암호문은 형식 오류로 거부한다', () => {
    expect(() => decryptJoinCode('YWJj', key)).toThrow();
  });

  it('한글/특수문자 코드도 왕복된다', () => {
    expect(decryptJoinCode(encryptJoinCode('가입코드!@#', key), key)).toBe('가입코드!@#');
  });

  it('safeEqual은 같은 값만 true', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
