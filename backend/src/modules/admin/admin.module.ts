import { Module } from '@nestjs/common';
import { UserModule } from '../users/user.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';

// 강제 탈퇴가 본인 탈퇴와 같은 처리(UserService.withdrawInTx)를 쓰므로 UserModule 을 가져온다
@Module({
  imports: [UserModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
