import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JoinCodeDto } from './auth.dto';

const check = (plain: object) => {
  const dto = plainToInstance(JoinCodeDto, plain);
  return validate(dto).then((errors) => ({ dto, errors }));
};

describe('JoinCodeDto', () => {
  it('정상 코드는 통과', async () => {
    const { errors } = await check({ code: 'KNOT-2026' });
    expect(errors).toHaveLength(0);
  });

  it('앞뒤 공백은 제거한다', async () => {
    const { dto, errors } = await check({ code: '  KNOT-2026  ' });
    expect(errors).toHaveLength(0);
    expect(dto.code).toBe('KNOT-2026');
  });

  it.each([
    ['빈 문자열', { code: '' }],
    ['공백만', { code: '   ' }],
    ['code 없음', {}],
    ['숫자', { code: 12345 }],
    ['객체', { code: { $ne: null } }],
    ['65자', { code: 'a'.repeat(65) }],
  ])('%s 는 검증 실패', async (_name, plain) => {
    expect((await check(plain)).errors.length).toBeGreaterThan(0);
  });

  it('64자는 허용', async () => {
    expect((await check({ code: 'a'.repeat(64) })).errors).toHaveLength(0);
  });
});
