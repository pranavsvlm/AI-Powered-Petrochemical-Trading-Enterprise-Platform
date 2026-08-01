import type {
  TenantScopedPrismaClient,
  Task,
  TaskComment,
  TaskChecklist,
  TaskPriority,
  TaskStatus,
} from '@platform/database';

export interface CreateTaskInput {
  companyId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: Date;
  startDate?: Date;
  assigneeUserId?: string;
  assigneeTeamId?: string;
  projectId?: string;
  createdByUserId?: string;
  sourceModule?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  ruleExecutionId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: Date | null;
  startDate?: Date | null;
  projectId?: string | null;
}

export type TaskWithChildren = Task & { comments: TaskComment[]; checklist: TaskChecklist[] };

const TASK_INCLUDE = {
  comments: { orderBy: { createdAt: 'asc' } },
  checklist: { orderBy: { position: 'asc' } },
} as const;

export class TaskRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateTaskInput): Promise<Task> {
    return this.db.task.create({ data: input });
  }

  findById(id: string): Promise<TaskWithChildren | null> {
    return this.db.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  }

  list(filters: {
    companyId: string;
    status?: TaskStatus;
    projectId?: string;
    assigneeUserId?: string;
  }): Promise<Task[]> {
    return this.db.task.findMany({
      where: {
        companyId: filters.companyId,
        status: filters.status,
        projectId: filters.projectId,
        assigneeUserId: filters.assigneeUserId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, data: UpdateTaskInput): Promise<Task> {
    return this.db.task.update({ where: { id }, data });
  }

  updateStatus(id: string, status: TaskStatus): Promise<Task> {
    return this.db.task.update({ where: { id }, data: { status } });
  }

  assign(id: string, assigneeUserId?: string, assigneeTeamId?: string): Promise<Task> {
    return this.db.task.update({ where: { id }, data: { assigneeUserId, assigneeTeamId } });
  }

  addComment(taskId: string, authorUserId: string, content: string): Promise<TaskComment> {
    return this.db.taskComment.create({ data: { taskId, authorUserId, content } });
  }

  addChecklistItem(taskId: string, label: string, position: number): Promise<TaskChecklist> {
    return this.db.taskChecklist.create({ data: { taskId, label, position } });
  }

  setChecklistItemDone(id: string, isDone: boolean): Promise<TaskChecklist> {
    return this.db.taskChecklist.update({ where: { id }, data: { isDone } });
  }

  countChecklistItems(taskId: string): Promise<number> {
    return this.db.taskChecklist.count({ where: { taskId } });
  }
}
