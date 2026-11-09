// 모든 REST API가 공통으로 사용하는 응답 포맷 (setting.md 5절)

export interface ErrorBody {
  code: string; // ErrorCode 값
  details?: unknown; // 입력 검증 실패 항목 등 외부에 노출해도 되는 정보만
}

export class CommonResponse<T = null> {
  private constructor(
    readonly success: boolean,
    readonly data: T | null,
    readonly message: string,
    readonly error: ErrorBody | null,
  ) {}

  // 성공 응답
  static ok<T>(data: T, message = '요청이 처리되었습니다.'): CommonResponse<T> {
    return new CommonResponse<T>(true, data, message, null);
  }

  // 실패 응답 (예외 처리기에서만 사용)
  static fail(message: string, error: ErrorBody): CommonResponse<null> {
    return new CommonResponse<null>(false, null, message, error);
  }
}
