import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type {
  TenantScopedPrismaClient,
  Project,
  ProjectMember,
  ProjectMilestone,
} from '@platform/database';
import {
  ProjectRepository,
  type CreateProjectInput,
  type ProjectWithChildren,
} from '../infrastructure/project.repository';
import type { TaskAuditWriter } from './task.service';

/** Application-layer use cases for the Project aggregate (doc 25). */
@Injectable()
export class ProjectService {
  private readonly repo: ProjectRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly audit: TaskAuditWriter,
  ) {
    this.repo = new ProjectRepository(db);
  }

  async create(
    input: CreateProjectInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Project> {
    const project = await this.repo.create(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.PROJECT_CREATED,
      entityType: 'Project',
      entityId: project.id,
      after: { name: input.name },
      ipAddress: ipAddress ?? null,
    });
    return project;
  }

  async getById(id: string): Promise<ProjectWithChildren> {
    const project = await this.repo.findById(id);
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }

  list(filters: Parameters<ProjectRepository['list']>[0]): Promise<Project[]> {
    return this.repo.list(filters);
  }

  async archive(id: string): Promise<Project> {
    await this.getById(id);
    return this.repo.updateStatus(id, 'ARCHIVED');
  }

  async addMember(projectId: string, userId: string): Promise<ProjectMember> {
    await this.getById(projectId);
    return this.repo.addMember(projectId, userId);
  }

  async addMilestone(projectId: string, title: string, dueDate?: Date): Promise<ProjectMilestone> {
    await this.getById(projectId);
    return this.repo.addMilestone(projectId, title, dueDate);
  }

  completeMilestone(id: string): Promise<ProjectMilestone> {
    return this.repo.completeMilestone(id);
  }
}
