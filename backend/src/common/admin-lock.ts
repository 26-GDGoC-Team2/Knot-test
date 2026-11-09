// 운영진 수 변경(탈퇴, 운영진 해제/지정)을 직렬화하는 트랜잭션 단위 잠금.
// 두 운영진이 동시에 탈퇴/해제하면 서로 "다른 운영진이 남아 있다"고 보고 둘 다 통과해 운영진이 0명이 될 수 있다.
// 운영진 수에 영향을 주는 모든 트랜잭션(탈퇴, 운영진 해제 API 등)은 시작 직후 이 함수를 호출할 것.
import type { Queryable } from './database.service';

export async function lockAdminChanges(db: Queryable): Promise<void> {
  await db.query(`SELECT pg_advisory_xact_lock(hashtext('knot:admin-change'))`);
}
