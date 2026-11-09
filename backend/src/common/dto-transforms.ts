// DTO 공통 변환 데코레이터 (class-transformer)
import { Transform } from 'class-transformer';

// 문자열 앞뒤 공백 제거. 빈 문자열은 null로 바꿔 "지우기"로 취급
export const trimToNull = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? null : t;
  });

export const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export const trimEach = () =>
  Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value));

// 쿼리스트링 ?roleIds=1&roleIds=2 또는 ?roleIds=1,2 를 숫자 배열로 변환
export const toIntArray = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parts = (Array.isArray(value) ? value : [value]).flatMap((v) => String(v).split(','));
    return parts
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map(Number);
  });

// ?available=true / false 문자열을 boolean으로 (그 외 값은 검증에서 거부되도록 그대로 둠)
export const toBoolean = () =>
  Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value));
