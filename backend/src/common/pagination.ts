// 목록 조회 공통 페이지네이션: 요청(PageRequest) / 응답(PageResponse)
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BadRequestError } from './app.exception';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type SortDirection = 'asc' | 'desc';
export interface ResolvedSort {
  column: string; // 허용 목록에서 매핑된 실제 컬럼명 (SQL에 안전하게 사용 가능)
  direction: SortDirection;
}

// 쿼리스트링: ?page=1&size=20&sortBy=createdAt&sortDir=desc
export class PageRequest {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  size: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: SortDirection;

  get offset(): number {
    return (this.page - 1) * this.size;
  }

  get limit(): number {
    return this.size;
  }

  // 정렬 허용 목록 검증. allowed = { API필드명: DB컬럼명 }
  resolveSort(allowed: Record<string, string>, fallback: ResolvedSort): ResolvedSort {
    if (!this.sortBy) return { column: fallback.column, direction: this.sortDir ?? fallback.direction };
    if (!Object.prototype.hasOwnProperty.call(allowed, this.sortBy)) {
      throw new BadRequestError(`정렬할 수 없는 항목입니다: ${this.sortBy}`);
    }
    return { column: allowed[this.sortBy], direction: this.sortDir ?? fallback.direction };
  }
}

export class PageResponse<T> {
  readonly totalPages: number;

  private constructor(
    readonly items: T[],
    readonly total: number,
    readonly page: number,
    readonly size: number,
  ) {
    this.totalPages = total === 0 ? 0 : Math.ceil(total / size);
  }

  static of<T>(items: T[], total: number, req: Pick<PageRequest, 'page' | 'size'>): PageResponse<T> {
    return new PageResponse(items, Math.max(0, total), req.page, req.size);
  }
}
