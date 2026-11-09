// 배포 환경 헬스체크용 (공개 경로). DB 연결 확인 없이 프로세스 생존만 알린다.
import { Controller, Get } from '@nestjs/common';
import { CommonResponse } from './common-response';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return CommonResponse.ok({ status: 'ok' });
  }
}
