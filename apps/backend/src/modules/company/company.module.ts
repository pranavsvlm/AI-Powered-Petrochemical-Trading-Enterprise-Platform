import { Module } from '@nestjs/common';
import { CompanyService } from '@modules/company';
import { CompanyController } from './company.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [CompanyController],
  providers: [
    AuditService,
    {
      provide: CompanyService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new CompanyService(prisma.client, audit),
      inject: [PrismaService, AuditService],
    },
  ],
  exports: [CompanyService],
})
export class CompanyModule {}
