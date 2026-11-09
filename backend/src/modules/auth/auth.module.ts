import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';

// DatabaseModule, JwtModule은 AppModule에서 전역으로 제공된다.
@Module({
  controllers: [AuthController],
  providers: [AuthService, GoogleAuthService, AuthRepository],
  exports: [AuthService, AuthRepository],
})
export class AuthModule {}
