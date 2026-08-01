import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Delete,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { TaskService, ProjectService, TimeEntryService } from '@modules/tasks';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  AddChecklistItemDto,
  AddProjectMemberDto,
  AddProjectMilestoneDto,
  AddTaskCommentDto,
  AssignTaskDto,
  ChangeTaskStatusDto,
  CreateManualTimeEntryDto,
  CreateProjectDto,
  CreateTaskDto,
  SetChecklistItemDoneDto,
  StartTimeEntryDto,
  UpdateTaskDto,
} from './dto/task.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TaskService) {}

  @RequirePermission('tasks', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateTaskDto, @Req() req: AuthedRequest) {
    return this.tasks.create(
      {
        companyId: req.user.companyId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        assigneeUserId: dto.assigneeUserId,
        assigneeTeamId: dto.assigneeTeamId,
        projectId: dto.projectId,
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('tasks', PermissionAction.VIEW)
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('assigneeUserId') assigneeUserId?: string,
  ) {
    return this.tasks.list({
      companyId: req.user.companyId,
      status: status as never,
      projectId,
      assigneeUserId,
    });
  }

  @RequirePermission('tasks', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.getById(id);
  }

  @RequirePermission('tasks', PermissionAction.EDIT)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: AuthedRequest,
  ) {
    return this.tasks.update(
      id,
      {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        projectId: dto.projectId,
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  /** Archives (status=ARCHIVED) — never a real DELETE, same convention as every other module. */
  @RequirePermission('tasks', PermissionAction.EDIT)
  @Delete(':id')
  archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.tasks.archive(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('tasks', PermissionAction.EDIT)
  @Post(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTaskStatusDto,
    @Req() req: AuthedRequest,
  ) {
    return this.tasks.changeStatus(id, dto.status, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('tasks', PermissionAction.EDIT)
  @Post(':id/assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTaskDto,
    @Req() req: AuthedRequest,
  ) {
    return this.tasks.assign(
      id,
      dto.assigneeUserId,
      dto.assigneeTeamId,
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('tasks', PermissionAction.EDIT)
  @Post(':id/comments')
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTaskCommentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.tasks.addComment(id, req.user.sub, dto.content);
  }

  @RequirePermission('tasks', PermissionAction.EDIT)
  @Post(':id/checklist-items')
  addChecklistItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddChecklistItemDto) {
    return this.tasks.addChecklistItem(id, dto.label);
  }

  @RequirePermission('tasks', PermissionAction.EDIT)
  @Put(':id/checklist-items/:itemId')
  setChecklistItemDone(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SetChecklistItemDoneDto,
  ) {
    return this.tasks.setChecklistItemDone(itemId, dto.isDone);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectService) {}

  @RequirePermission('tasks', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateProjectDto, @Req() req: AuthedRequest) {
    return this.projects.create(
      {
        companyId: req.user.companyId,
        name: dto.name,
        description: dto.description,
        ownerUserId: dto.ownerUserId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        budget: dto.budget,
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('tasks', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('status') status?: string) {
    return this.projects.list({ companyId: req.user.companyId, status: status as never });
  }

  @RequirePermission('tasks', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.getById(id);
  }

  @RequirePermission('tasks', PermissionAction.EDIT)
  @Post(':id/members')
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddProjectMemberDto) {
    return this.projects.addMember(id, dto.userId);
  }

  @RequirePermission('tasks', PermissionAction.EDIT)
  @Post(':id/milestones')
  addMilestone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddProjectMilestoneDto) {
    return this.projects.addMilestone(
      id,
      dto.title,
      dto.dueDate ? new Date(dto.dueDate) : undefined,
    );
  }

  @RequirePermission('tasks', PermissionAction.EDIT)
  @Post('milestones/:milestoneId/complete')
  completeMilestone(@Param('milestoneId', ParseUUIDPipe) milestoneId: string) {
    return this.projects.completeMilestone(milestoneId);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntries: TimeEntryService) {}

  @RequirePermission('tasks', PermissionAction.CREATE)
  @Post('start')
  start(@Body() dto: StartTimeEntryDto, @Req() req: AuthedRequest) {
    return this.timeEntries.start({
      companyId: req.user.companyId,
      userId: req.user.sub,
      taskId: dto.taskId,
      projectId: dto.projectId,
      startedAt: new Date(),
      notes: dto.notes,
    });
  }

  @RequirePermission('tasks', PermissionAction.EDIT)
  @Post(':id/stop')
  stop(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.timeEntries.stop(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('tasks', PermissionAction.CREATE)
  @Post()
  createManual(@Body() dto: CreateManualTimeEntryDto, @Req() req: AuthedRequest) {
    const startedAt = new Date(dto.startedAt);
    const endedAt = new Date(dto.endedAt);
    const durationMinutes = Math.floor((endedAt.getTime() - startedAt.getTime()) / 60_000);
    return this.timeEntries.createManual(
      {
        companyId: req.user.companyId,
        userId: req.user.sub,
        taskId: dto.taskId,
        projectId: dto.projectId,
        startedAt,
        endedAt,
        durationMinutes,
        notes: dto.notes,
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('tasks', PermissionAction.VIEW)
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('taskId') taskId?: string,
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.timeEntries.list({ companyId: req.user.companyId, userId, taskId, projectId });
  }
}
