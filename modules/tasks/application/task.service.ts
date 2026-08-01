import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type {
  TenantScopedPrismaClient,
  Task,
  TaskComment,
  TaskChecklist,
} from '@platform/database';
import type { TaskGenerationRequestedPayload } from '@platform/event-bus';
import { isValidStatusTransition } from '../domain/task-status';
import {
  TaskRepository,
  type CreateTaskInput,
  type UpdateTaskInput,
  type TaskWithChildren,
} from '../infrastructure/task.repository';

export interface TaskAuditWriter {
  record(entry: {
    companyId: string | null;
    actorUserId: string | null;
    eventType: AuditEventType;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
  }): Promise<void>;
}

/**
 * Application-layer use cases for the Task aggregate (doc 25). No ApprovalEvaluator dependency
 * — unlike Customer/Product/Quotation, doc 25 has no "task requires approval" language.
 * `createFromEvent` is the real consumer-side handler for `TaskGenerationRequested`
 * (see docs/DOMAIN_MODEL_PHASE7.md §3) — it is the only creation path with no `actorUserId`,
 * since the task is system-generated, not created by a human in the same request.
 */
@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);
  private readonly repo: TaskRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly audit: TaskAuditWriter,
  ) {
    this.repo = new TaskRepository(db);
  }

  async create(
    input: CreateTaskInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Task> {
    const task = await this.repo.create({ ...input, createdByUserId: actorUserId });
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.TASK_CREATED,
      entityType: 'Task',
      entityId: task.id,
      after: { title: input.title, priority: input.priority, projectId: input.projectId },
      ipAddress: ipAddress ?? null,
    });
    return task;
  }

  /** Real consumer of `TaskGenerationRequested` — see `infrastructure/task-generation-requested.subscriber.ts`. */
  async createFromEvent(payload: TaskGenerationRequestedPayload): Promise<Task> {
    const task = await this.repo.create({
      companyId: payload.companyId,
      title: payload.title,
      description: payload.description,
      dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
      assigneeUserId: payload.assigneeUserId,
      assigneeTeamId: payload.assigneeTeamId,
      sourceModule: payload.sourceModule,
      sourceEntityType: payload.sourceModule,
      sourceEntityId: payload.sourceEntityId,
      ruleExecutionId: undefined,
    });
    await this.audit.record({
      companyId: payload.companyId,
      actorUserId: null,
      eventType: AuditEventType.AI_TASK_GENERATED,
      entityType: 'Task',
      entityId: task.id,
      after: { title: payload.title, sourceModule: payload.sourceModule, ruleId: payload.ruleId },
    });
    return task;
  }

  async getById(id: string): Promise<TaskWithChildren> {
    const task = await this.repo.findById(id);
    if (!task) throw new NotFoundException('Task not found.');
    return task;
  }

  list(filters: Parameters<TaskRepository['list']>[0]): Promise<Task[]> {
    return this.repo.list(filters);
  }

  async update(
    id: string,
    data: UpdateTaskInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Task> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, data);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.TASK_UPDATED,
      entityType: 'Task',
      entityId: id,
      before: { title: before.title },
      after: { title: updated.title },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  /** Archives rather than deletes — same no-hard-delete convention as every other module. */
  async archive(id: string, actorUserId: string, ipAddress?: string | null): Promise<Task> {
    const before = await this.getById(id);
    const updated = await this.repo.updateStatus(id, 'ARCHIVED');
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.TASK_STATUS_CHANGED,
      entityType: 'Task',
      entityId: id,
      before: { status: before.status },
      after: { status: 'ARCHIVED' },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async changeStatus(
    id: string,
    status: Task['status'],
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Task> {
    const before = await this.getById(id);
    if (!isValidStatusTransition(before.status, status)) {
      throw new BadRequestException(`Cannot move a task from ${before.status} to ${status}.`);
    }
    const updated = await this.repo.updateStatus(id, status);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType:
        status === 'COMPLETED' ? AuditEventType.TASK_COMPLETED : AuditEventType.TASK_STATUS_CHANGED,
      entityType: 'Task',
      entityId: id,
      before: { status: before.status },
      after: { status },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async assign(
    id: string,
    assigneeUserId: string | undefined,
    assigneeTeamId: string | undefined,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Task> {
    const before = await this.getById(id);
    const updated = await this.repo.assign(id, assigneeUserId, assigneeTeamId);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: before.assigneeUserId
        ? AuditEventType.TASK_REASSIGNED
        : AuditEventType.TASK_ASSIGNED,
      entityType: 'Task',
      entityId: id,
      before: { assigneeUserId: before.assigneeUserId },
      after: { assigneeUserId, assigneeTeamId },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async addComment(taskId: string, authorUserId: string, content: string): Promise<TaskComment> {
    await this.getById(taskId);
    return this.repo.addComment(taskId, authorUserId, content);
  }

  async addChecklistItem(taskId: string, label: string): Promise<TaskChecklist> {
    await this.getById(taskId);
    const position = await this.repo.countChecklistItems(taskId);
    return this.repo.addChecklistItem(taskId, label, position);
  }

  setChecklistItemDone(id: string, isDone: boolean): Promise<TaskChecklist> {
    return this.repo.setChecklistItemDone(id, isDone);
  }
}
