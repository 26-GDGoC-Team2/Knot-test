// 비즈니스 로직에서 던지는 커스텀 예외. 상태 코드는 ErrorCode로 결정된다.
import { ERROR_META, ErrorCode } from './error-code';

export class AppException extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string, // 생략하면 ErrorCode 기본 메시지 사용
    readonly details?: unknown,
  ) {
    super(message ?? ERROR_META[code].message);
    this.name = new.target.name;
  }

  get status(): number {
    return ERROR_META[this.code].status;
  }
}

// Nest 내장 예외와 이름이 겹치지 않도록 Error 접미사를 사용한다.
export class BadRequestError extends AppException {
  constructor(message?: string, details?: unknown, code: ErrorCode = ErrorCode.BAD_REQUEST) {
    super(code, message, details);
  }
}

export class UnauthorizedError extends AppException {
  constructor(message?: string, code: ErrorCode = ErrorCode.UNAUTHORIZED) {
    super(code, message);
  }
}

export class ForbiddenError extends AppException {
  constructor(message?: string) {
    super(ErrorCode.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppException {
  constructor(message?: string) {
    super(ErrorCode.NOT_FOUND, message);
  }
}

export class ConflictError extends AppException {
  constructor(message?: string) {
    super(ErrorCode.CONFLICT, message);
  }
}

export class InternalError extends AppException {
  constructor(message?: string) {
    super(ErrorCode.INTERNAL_ERROR, message);
  }
}

// 외부 서비스(AI 추천 서버 등)를 일시적으로 쓸 수 없을 때 (503)
export class ServiceUnavailableError extends AppException {
  constructor(message?: string) {
    super(ErrorCode.SERVICE_UNAVAILABLE, message);
  }
}
