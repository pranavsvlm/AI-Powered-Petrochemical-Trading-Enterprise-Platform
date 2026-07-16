import { Module } from '@nestjs/common';
import { ConsoleEmailSenderAdapter, EMAIL_SENDER_PORT } from '@platform/auth';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuditService,
    { provide: EMAIL_SENDER_PORT, useClass: ConsoleEmailSenderAdapter },
  ],
  exports: [AuthService],
})
export class AuthModule {}
