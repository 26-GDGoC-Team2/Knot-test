// 가입 코드 암호화 유틸 (AES-256-GCM). 인증 모듈(검증)과 운영진 모듈(저장/조회)이 함께 사용한다.
// 저장 형식(join_codes.code_enc): base64( iv 12바이트 | 인증 태그 16바이트 | 암호문 )
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getJoinCodeKey } from '../config/auth.config';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encryptJoinCode(plain: string, key: Buffer = getJoinCodeKey()): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decryptJoinCode(payload: string, key: Buffer = getJoinCodeKey()): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length <= IV_LENGTH + TAG_LENGTH) throw new Error('가입 코드 암호문 형식이 올바르지 않습니다.');
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, IV_LENGTH));
  decipher.setAuthTag(buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([decipher.update(buf.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString('utf8');
}

// 타이밍 공격을 피하기 위해 해시 후 상수 시간 비교
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
