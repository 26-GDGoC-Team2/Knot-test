// 앱 진입점
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

async function bootstrap(): Promise<void> {
  // .env가 있으면 로드 (Node 내장, 추가 라이브러리 불필요)
  if (existsSync('.env')) process.loadEnvFile('.env');

  // env 로드 후에 모듈을 불러온다.
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);

  // Refresh 쿠키를 주고받기 위해 프론트 origin만 credentials와 함께 허용
  const { getFrontendUrl } = await import('./config/auth.config');
  app.enableCors({ origin: getFrontendUrl(), credentials: true });

  // DTO 검증: 정의되지 않은 필드는 제거하고 타입을 변환한다.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
