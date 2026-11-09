// 루트 모듈: 공통 예외 필터, 인증 미들웨어, 역할/검증 가드를 앱 전역에 연결한다.
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { AuthMiddleware } from './common/auth-middleware';
import { DatabaseModule } from './common/database.service';
import { GlobalExceptionFilter } from './common/exception-handler';
import { HealthController } from './common/health.controller';
import { RolesGuard } from './common/role-guard';
import { VerifiedGuard } from './common/verified-guard';
import { getAuthConfig, PUBLIC_ROUTES } from './config/auth.config';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { UserModule } from './modules/users/user.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { ActivityModule } from './modules/activity/activity.module';
import { ArchiveModule } from './modules/archive/archive.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
@Module({
  imports: [
    DatabaseModule,
    // access token 검증/발급용. 전역 제공(AuthModule 등에서 JwtService 주입). env 로드 이후 평가되도록 비동기 등록
    JwtModule.registerAsync({
      global: true,
      useFactory: (): JwtModuleOptions => {
        const cfg = getAuthConfig();
        return {
          secret: cfg.accessSecret,
          signOptions: { expiresIn: cfg.accessExpiresIn as never },
        };
      },
    }),
    AuthModule,
    UserModule,
    ProfileModule,
    RecruitmentModule,
     AdminModule,
     ActivityModule,
     ArchiveModule,
     RecommendationModule,
     NotificationModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // 가드 순서: 가입 코드 인증 여부 → 역할
    { provide: APP_GUARD, useClass: VerifiedGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    AuthMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthMiddleware)
      .exclude(...PUBLIC_ROUTES.map((path) => ({ path, method: RequestMethod.ALL })))
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
