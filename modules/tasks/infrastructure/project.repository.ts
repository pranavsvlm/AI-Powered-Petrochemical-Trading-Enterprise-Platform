import type {
  TenantScopedPrismaClient,
  Project,
  ProjectMember,
  ProjectMilestone,
  ProjectStatus,
  Task,
} from '@platform/database';

export interface CreateProjectInput {
  companyId: string;
  name: string;
  description?: string;
  ownerUserId?: string;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
}

export type ProjectWithChildren = Project & {
  members: ProjectMember[];
  milestones: ProjectMilestone[];
  tasks: Task[];
};

const PROJECT_INCLUDE = {
  members: { orderBy: { addedAt: 'asc' } },
  milestones: { orderBy: { dueDate: 'asc' } },
  tasks: { orderBy: { createdAt: 'desc' } },
} as const;

export class ProjectRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateProjectInput): Promise<Project> {
    return this.db.project.create({ data: input });
  }

  findById(id: string): Promise<ProjectWithChildren | null> {
    return this.db.project.findUnique({ where: { id }, include: PROJECT_INCLUDE });
  }

  list(filters: { companyId: string; status?: ProjectStatus }): Promise<Project[]> {
    return this.db.project.findMany({
      where: { companyId: filters.companyId, status: filters.status },
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, status: ProjectStatus): Promise<Project> {
    return this.db.project.update({ where: { id }, data: { status } });
  }

  addMember(projectId: string, userId: string): Promise<ProjectMember> {
    return this.db.projectMember.create({ data: { projectId, userId } });
  }

  addMilestone(projectId: string, title: string, dueDate?: Date): Promise<ProjectMilestone> {
    return this.db.projectMilestone.create({ data: { projectId, title, dueDate } });
  }

  completeMilestone(id: string): Promise<ProjectMilestone> {
    return this.db.projectMilestone.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
}
