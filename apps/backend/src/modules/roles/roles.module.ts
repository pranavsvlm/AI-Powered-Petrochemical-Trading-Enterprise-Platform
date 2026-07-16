import { Module } from '@nestjs/common';
import {
  ApprovalRulesController,
  PermissionsController,
  PoliciesController,
  RolesController,
} from './roles.controller';
import { RolesService } from './roles.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [
    RolesController,
    PermissionsController,
    PoliciesController,
    ApprovalRulesController,
  ],
  providers: [RolesService, AuditService],
  exports: [RolesService],
})
export class RolesModule {}
