import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const TASK_STATUSES = [
  'BACKLOG',
  'PLANNED',
  'IN_PROGRESS',
  'REVIEW',
  'COMPLETED',
  'ARCHIVED',
] as const;

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: (typeof TASK_PRIORITIES)[number];

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsString()
  assigneeTeamId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: (typeof TASK_PRIORITIES)[number];

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}

export class ChangeTaskStatusDto {
  @IsIn(TASK_STATUSES)
  status!: (typeof TASK_STATUSES)[number];
}

export class AssignTaskDto {
  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsString()
  assigneeTeamId?: string;
}

export class AddTaskCommentDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class AddChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  label!: string;
}

export class SetChecklistItemDoneDto {
  @IsBoolean()
  isDone!: boolean;
}

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;
}

export class AddProjectMemberDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

export class AddProjectMilestoneDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}

export class StartTimeEntryDto {
  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateManualTimeEntryDto {
  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsISO8601()
  startedAt!: string;

  @IsISO8601()
  endedAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
