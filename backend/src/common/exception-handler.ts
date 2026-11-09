// 전역 예외 처리기: 모든 예외를 CommonResponse 실패 포맷으로 변환한다.
// 내부 오류 상세/스택/토큰/개인정보는 외부에 노출하지 않고 서버 로그에만 남긴다.
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AppException } from './app.exception';
import { CommonResponse } from './common-response';
import { ERROR_META, ErrorCode } from './error-code';

// Nest HttpException 상태 코드 → ErrorCode
const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    // 1) 비즈니스 예외
    if (exception instanceof AppException) {
      res
        .status(exception.status)
        .json(CommonResponse.fail(exception.message, { code: exception.code, details: exception.details }));
      return;
    }

    // 2) Nest 내장 예외 (ValidationPipe 검증 실패, 라우트 없음 등)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_TO_CODE[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);
      const body = exception.getResponse();
      // ValidationPipe는 message를 문자열 배열로 준다 → details로 전달
      const rawMessage = typeof body === 'object' && body !== null ? (body as { message?: unknown }).message : undefined;
      const isValidation = status === 400 && Array.isArray(rawMessage);

      if (status >= 500) this.logger.error(exception.message, exception.stack);

      res
        .status(status)
        .json(
          CommonResponse.fail(
            status >= 500 ? ERROR_META[ErrorCode.INTERNAL_ERROR].message : ERROR_META[isValidation ? ErrorCode.VALIDATION_FAILED : code].message,
            {
              code: isValidation ? ErrorCode.VALIDATION_FAILED : code,
              details: isValidation ? rawMessage : undefined,
            },
          ),
        );
      return;
    }

    // 3) 그 외 예상치 못한 오류: 상세는 로그에만 기록
    this.logger.error(
      exception instanceof Error ? exception.message : 'Unknown error',
      exception instanceof Error ? exception.stack : undefined,
    );
    res
      .status(ERROR_META[ErrorCode.INTERNAL_ERROR].status)
      .json(CommonResponse.fail(ERROR_META[ErrorCode.INTERNAL_ERROR].message, { code: ErrorCode.INTERNAL_ERROR }));
  }
}
