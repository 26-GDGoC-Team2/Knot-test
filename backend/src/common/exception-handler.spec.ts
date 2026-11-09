import { BadRequestException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { ConflictError } from './app.exception';
import { GlobalExceptionFilter } from './exception-handler';

function run(exception: unknown) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as never;
  new GlobalExceptionFilter().catch(exception, host);
  return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0] };
}

describe('GlobalExceptionFilter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('비즈니스 예외는 상태 코드와 CommonResponse 실패 형식으로 변환', () => {
    const { status, body } = run(new ConflictError('이미 가입된 이메일입니다.'));
    expect(status).toBe(409);
    expect(body).toEqual({
      success: false,
      data: null,
      message: '이미 가입된 이메일입니다.',
      error: { code: 'CONFLICT', details: undefined },
    });
  });

  it('ValidationPipe 검증 실패는 400 VALIDATION_FAILED와 details', () => {
    const { status, body } = run(new BadRequestException({ message: ['code should not be empty'], error: 'Bad Request' }));
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toEqual(['code should not be empty']);
  });

  it('Nest 내장 404는 NOT_FOUND', () => {
    const { status, body } = run(new NotFoundException());
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('5xx HttpException은 내부 메시지를 숨기고 일반 메시지만 노출', () => {
    const { status, body } = run(new HttpException('db password is hunter2', 500));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('예상치 못한 오류는 500이고 상세/스택을 응답에 포함하지 않는다', () => {
    const { status, body } = run(new Error('connect ECONNREFUSED 10.0.0.5:5432 user=admin'));
    expect(status).toBe(500);
    expect(body.message).toBe('서버 오류가 발생했습니다.');
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|admin|stack/);
  });

  it('Error가 아닌 값이 던져져도 500으로 처리', () => {
    expect(run('문자열 예외').status).toBe(500);
    expect(run(undefined).status).toBe(500);
  });
});
