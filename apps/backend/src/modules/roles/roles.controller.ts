import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RolesService } from './roles.service';
import {
  AssignRoleDto,
  CreateApprovalRuleDto,
  CreatePolicyDto,
  CreateRoleDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './dto/role.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @RequirePermission('roles', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateRoleDto, @Req() req: AuthedRequest) {
    return this.rolesService.createRole(
      req.user.companyId,
      dto.name,
      dto.description,
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('roles', PermissionAction.VIEW)
  @Get()
  list() {
    return this.rolesService.listRoles();
  }

  @RequirePermission('roles', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.getRole(id);
  }

  @RequirePermission('roles', PermissionAction.EDIT)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: AuthedRequest,
  ) {
    return this.rolesService.updateRole(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('roles', PermissionAction.MANAGE_SETTINGS)
  @Put(':id/permissions')
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
    @Req() req: AuthedRequest,
  ) {
    return this.rolesService.setRolePermissions(
      id,
      dto.permissionIds,
      req.user.sub,
      req.user.companyId,
      req.ip ?? null,
    );
  }

  @RequirePermission('roles', PermissionAction.MANAGE_SETTINGS)
  @Post('assign')
  assign(@Body() dto: AssignRoleDto, @Req() req: AuthedRequest) {
    return this.rolesService.assignRole(
      dto.userId,
      dto.roleId,
      req.user.sub,
      req.user.companyId,
      req.ip ?? null,
    );
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @RequirePermission('roles', PermissionAction.VIEW)
  @Get()
  list() {
    return this.rolesService.listPermissions();
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('policies')
export class PoliciesController {
  constructor(private readonly rolesService: RolesService) {}

  @RequirePermission('policies', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreatePolicyDto, @Req() req: AuthedRequest) {
    return this.rolesService.createPolicy(
      req.user.companyId,
      dto.name,
      dto.definition,
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('policies', PermissionAction.VIEW)
  @Get()
  list() {
    return this.rolesService.listPolicies();
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('approval-rules')
export class ApprovalRulesController {
  constructor(private readonly rolesService: RolesService) {}

  @RequirePermission('approval-rules', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateApprovalRuleDto, @Req() req: AuthedRequest) {
    return this.rolesService.createApprovalRule(
      req.user.companyId,
      dto.name,
      dto.triggerCondition,
      dto.approverRoleId,
      dto.threshold,
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('approval-rules', PermissionAction.VIEW)
  @Get()
  list() {
    return this.rolesService.listApprovalRules();
  }

  @RequirePermission('approval-rules', PermissionAction.APPROVE)
  @Post('history/:id/decide')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { approve: boolean },
    @Req() req: AuthedRequest,
  ) {
    return this.rolesService.decideApproval(
      id,
      req.user.sub,
      dto.approve,
      req.user.companyId,
      req.ip ?? null,
    );
  }
}
