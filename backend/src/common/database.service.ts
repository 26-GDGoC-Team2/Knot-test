// 순수 pg 기반 DB 접근 + 트랜잭션 헬퍼. Repository는 Queryable만 의존한다.
import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { getDatabaseUrl } from '../config/database.config';

// Pool과 트랜잭션 client 모두 만족하는 최소 인터페이스
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}

// PostgreSQL unique_violation 여부
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

@Injectable()
export class DatabaseService implements Queryable, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({ connectionString: getDatabaseUrl() });
    // 유휴 연결 오류로 프로세스가 죽지 않도록 로그만 남긴다.
    this.pool.on('error', (e) => this.logger.error(`DB 풀 오류: ${e.message}`));
  }

  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, params);
  }

  // fn 안의 모든 쿼리를 하나의 트랜잭션으로 실행. 예외 시 롤백
  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // 롤백 실패는 원래 예외를 가리지 않도록 무시
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
