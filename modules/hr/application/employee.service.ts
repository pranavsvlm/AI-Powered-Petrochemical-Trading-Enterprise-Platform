import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type { TenantScopedPrismaClient, Employee } from '@platform/database';
import {
  EmployeeRepository,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from '../infrastructure/employee.repository';
import type { DepartmentLookupPort, HrAuditWriter, TeamLookupPort } from './ports';

/**
 * The core Employee aggregate (doc 15) — a 1:1 link to the existing `User` (auth identity is
 * never duplicated here), referencing the existing `Department`/`Team`/`Branch` models rather
 * than redefining them. Department/Team references are validated through the owning module's
 * own lookup ports before insert — the same "never a raw cross-module FK without validation"
 * discipline every prior module has used.
 */
@Injectable()
export class EmployeeService {
  private readonly repo: EmployeeRepository;

  constructor(
    db: TenantScopedPrismaClient,
    private readonly departments: DepartmentLookupPort,
    private readonly teams: TeamLookupPort,
    private readonly audit: HrAuditWriter,
  ) {
    this.repo = new EmployeeRepository(db);
  }

  async create(
    input: CreateEmployeeInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Employee> {
    if (input.departmentId && !(await this.departments.getById(input.departmentId))) {
      throw new BadRequestException('Department not found.');
    }
    if (input.teamId && !(await this.teams.getById(input.teamId))) {
      throw new BadRequestException('Team not found.');
    }

    const employee = await this.repo.create(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.EMPLOYEE_CREATED,
      entityType: 'Employee',
      entityId: employee.id,
      after: { employeeNumber: input.employeeNumber, jobTitle: input.jobTitle },
      ipAddress: ipAddress ?? null,
    });
    return employee;
  }

  async update(
    id: string,
    input: UpdateEmployeeInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Employee> {
    const existing = await this.getById(id);
    if (input.departmentId && !(await this.departments.getById(input.departmentId))) {
      throw new BadRequestException('Department not found.');
    }
    if (input.teamId && !(await this.teams.getById(input.teamId))) {
      throw new BadRequestException('Team not found.');
    }

    const employee = await this.repo.update(id, input);
    await this.audit.record({
      companyId: existing.companyId,
      actorUserId,
      eventType: AuditEventType.EMPLOYEE_UPDATED,
      entityType: 'Employee',
      entityId: id,
      before: { jobTitle: existing.jobTitle, employmentStatus: existing.employmentStatus },
      after: { jobTitle: employee.jobTitle, employmentStatus: employee.employmentStatus },
      ipAddress: ipAddress ?? null,
    });
    return employee;
  }

  async getById(id: string): Promise<Employee> {
    const employee = await this.repo.findById(id);
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  getByUserId(userId: string): Promise<Employee | null> {
    return this.repo.findByUserId(userId);
  }

  list(companyId: string, departmentId?: string): Promise<Employee[]> {
    return this.repo.list(companyId, departmentId);
  }

  listDirectReports(managerId: string): Promise<Employee[]> {
    return this.repo.listByManager(managerId);
  }
}
