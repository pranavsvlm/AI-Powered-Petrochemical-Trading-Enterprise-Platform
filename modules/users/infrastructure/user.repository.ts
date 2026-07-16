import type {
  TenantScopedPrismaClient,
  User,
  Department,
  Team,
  UserStatus,
} from '@platform/database';

export interface CreateUserInput {
  companyId: string;
  employeeCode?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  passwordHash: string;
  timezone?: string;
  language?: string;
}

export class UserRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateUserInput): Promise<User> {
    return this.db.user.create({ data: { ...input, status: 'PENDING_INVITATION' as UserStatus } });
  }

  findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.db.user.findFirst({ where: { email } });
  }

  list(): Promise<User[]> {
    return this.db.user.findMany({ orderBy: { createdAt: 'desc' } });
  }

  update(id: string, data: Partial<User>): Promise<User> {
    return this.db.user.update({ where: { id }, data });
  }

  setStatus(id: string, status: UserStatus): Promise<User> {
    return this.db.user.update({ where: { id }, data: { status } });
  }
}

export class DepartmentRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(companyId: string, name: string, managerId?: string): Promise<Department> {
    return this.db.department.create({ data: { companyId, name, managerId } });
  }

  list(): Promise<Department[]> {
    return this.db.department.findMany();
  }
}

export class TeamRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(companyId: string, departmentId: string, name: string): Promise<Team> {
    return this.db.team.create({ data: { companyId, departmentId, name } });
  }

  list(): Promise<Team[]> {
    return this.db.team.findMany();
  }
}
