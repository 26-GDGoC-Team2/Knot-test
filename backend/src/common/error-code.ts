// 에러 코드와 HTTP 상태/기본 메시지 매핑

export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  JOIN_CODE_MISMATCH = 'JOIN_CODE_MISMATCH',
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  FORBIDDEN = 'FORBIDDEN',
  JOIN_CODE_REQUIRED = 'JOIN_CODE_REQUIRED',
  LAST_ADMIN = 'LAST_ADMIN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export const ERROR_META: Record<ErrorCode, { status: number; message: string }> = {
  [ErrorCode.BAD_REQUEST]: { status: 400, message: '잘못된 요청입니다.' },
  [ErrorCode.VALIDATION_FAILED]: { status: 400, message: '입력값이 올바르지 않습니다.' },
  [ErrorCode.JOIN_CODE_MISMATCH]: { status: 400, message: '가입 코드가 맞지 않아요' },
  [ErrorCode.UNAUTHORIZED]: { status: 401, message: '인증이 필요합니다.' },
  [ErrorCode.TOKEN_EXPIRED]: { status: 401, message: '인증이 만료되었습니다. 다시 로그인해 주세요.' },
  [ErrorCode.FORBIDDEN]: { status: 403, message: '접근 권한이 없습니다.' },
  [ErrorCode.JOIN_CODE_REQUIRED]: { status: 403, message: '가입 코드 인증이 필요합니다.' },
  [ErrorCode.LAST_ADMIN]: { status: 403, message: '마지막 운영진은 탈퇴할 수 없습니다.' },
  [ErrorCode.NOT_FOUND]: { status: 404, message: '대상을 찾을 수 없습니다.' },
  [ErrorCode.CONFLICT]: { status: 409, message: '이미 처리되었거나 중복된 요청입니다.' },
  [ErrorCode.INTERNAL_ERROR]: { status: 500, message: '서버 오류가 발생했습니다.' },
};
