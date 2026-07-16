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
import { UserService } from '@modules/users';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateDepartmentDto, CreateTeamDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @RequirePermission('users', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: AuthedRequest) {
    return this.userService.create(
      { ...dto, companyId: req.user.companyId },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('users', PermissionAction.VIEW)
  @Get()
  list() {
    return this.userService.list();
  }

  @RequirePermission('users', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.getById(id);
  }

  @RequirePermission('users', PermissionAction.EDIT)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthedRequest,
  ) {
    return this.userService.update(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('users', PermissionAction.EDIT)
  @Post(':id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.userService.suspend(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('users', PermissionAction.EDIT)
  @Post(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.userService.activate(id, req.user.sub, req.ip ?? null);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly userService: UserService) {}

  @RequirePermission('departments', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateDepartmentDto, @Req() req: AuthedRequest) {
    return this.userService.createDepartment(req.user.companyId, dto.name, dto.managerId);
  }

  @RequirePermission('departments', PermissionAction.VIEW)
  @Get()
  list() {
    return this.userService.listDepartments();
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly userService: UserService) {}

  @RequirePermission('teams', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateTeamDto, @Req() req: AuthedRequest) {
    return this.userService.createTeam(req.user.companyId, dto.departmentId, dto.name);
  }

  @RequirePermission('teams', PermissionAction.VIEW)
  @Get()
  list() {
    return this.userService.listTeams();
  }
}
