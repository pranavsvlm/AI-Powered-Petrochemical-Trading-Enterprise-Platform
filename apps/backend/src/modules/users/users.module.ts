import { Module } from '@nestjs/common';
import { UserService } from '@modules/users';
import { DepartmentsController, TeamsController, UsersController } from './users.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [UsersController, DepartmentsController, TeamsController],
  providers: [
    AuditService,
    {
      provide: UserService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new UserService(prisma.client, audit),
      inject: [PrismaService, AuditService],
    },
  ],
  exports: [UserService],
})
export class UsersModule {}
