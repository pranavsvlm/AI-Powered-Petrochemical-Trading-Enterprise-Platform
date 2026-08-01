import type {
  TenantScopedPrismaClient,
  Employee,
  EmploymentType,
  EmploymentStatus,
} from '@platform/database';

export interface CreateEmployeeInput {
  companyId: string;
  userId: string;
  employeeNumber: string;
  departmentId?: string;
  teamId?: string;
  branchId?: string;
  managerId?: string;
  jobTitle: string;
  employmentType: EmploymentType;
  hireDate: Date;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface UpdateEmployeeInput {
  departmentId?: string;
  teamId?: string;
  branchId?: string;
  managerId?: string;
  jobTitle?: string;
  employmentType?: EmploymentType;
  employmentStatus?: EmploymentStatus;
  terminationDate?: Date;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export class EmployeeRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateEmployeeInput): Promise<Employee> {
    return this.db.employee.create({ data: input });
  }

  update(id: string, input: UpdateEmployeeInput): Promise<Employee> {
    return this.db.employee.update({ where: { id }, data: input });
  }

  findById(id: string): Promise<Employee | null> {
    return this.db.employee.findUnique({ where: { id } });
  }

  findByUserId(userId: string): Promise<Employee | null> {
    return this.db.employee.findFirst({ where: { userId } });
  }

  list(companyId: string, departmentId?: string): Promise<Employee[]> {
    return this.db.employee.findMany({
      where: { companyId, departmentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listByManager(managerId: string): Promise<Employee[]> {
    return this.db.employee.findMany({ where: { managerId } });
  }
}
