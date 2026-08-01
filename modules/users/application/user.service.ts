import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { hashPassword } from '@platform/auth';
import { AuditEventType } from '@platform/core';
import { UserStatus } from '@platform/types';
import type { TenantScopedPrismaClient, User, Department, Team } from '@platform/database';
import {
  UserRepository,
  DepartmentRepository,
  TeamRepository,
} from '../infrastructure/user.repository';

export interface UsersAuditWriter {
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

export interface CreateUserRequest {
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  temporaryPassword: string;
  employeeCode?: string;
}

/** Application-layer use cases for the User aggregate (doc 06). Assumes caller-side authz. */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly users: UserRepository;
  private readonly departments: DepartmentRepository;
  private readonly teams: TeamRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly audit: UsersAuditWriter,
  ) {
    this.users = new UserRepository(db);
    this.departments = new DepartmentRepository(db);
    this.teams = new TeamRepository(db);
  }

  async create(
    req: CreateUserRequest,
    actorUserId: string | null,
    ip: string | null,
  ): Promise<User> {
    const existing = await this.users.findByEmail(req.email);
    if (existing)
      throw new ConflictException('A user with this email already exists in this company.');

    const passwordHash = await hashPassword(req.temporaryPassword);
    const user = await this.users.create({
      companyId: req.companyId,
      firstName: req.firstName,
      lastName: req.lastName,
      email: req.email,
      phone: req.phone,
      employeeCode: req.employeeCode,
      passwordHash,
    });
    await this.audit.record({
      companyId: req.companyId,
      actorUserId,
      eventType: AuditEventType.USER_CREATED,
      entityType: 'User',
      entityId: user.id,
      after: { email: user.email },
      ipAddress: ip,
    });
    this.logger.log(`User created: ${user.id}`);
    return user;
  }

  list(): Promise<User[]> {
    return this.users.list();
  }

  async getById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async update(
    id: string,
    data: Partial<Pick<User, 'firstName' | 'lastName' | 'phone' | 'timezone' | 'language'>>,
    actorUserId: string | null,
    ip: string | null,
  ): Promise<User> {
    const before = await this.getById(id);
    const updated = await this.users.update(id, data);
    await this.audit.record({
      companyId: updated.companyId,
      actorUserId,
      eventType: AuditEventType.USER_UPDATED,
      entityType: 'User',
      entityId: id,
      before: { firstName: before.firstName, lastName: before.lastName },
      after: { firstName: updated.firstName, lastName: updated.lastName },
      ipAddress: ip,
    });
    return updated;
  }

  async suspend(id: string, actorUserId: string | null, ip: string | null): Promise<User> {
    const user = await this.users.setStatus(id, UserStatus.SUSPENDED);
    await this.audit.record({
      companyId: user.companyId,
      actorUserId,
      eventType: AuditEventType.USER_UPDATED,
      entityType: 'User',
      entityId: id,
      after: { status: UserStatus.SUSPENDED },
      ipAddress: ip,
    });
    return user;
  }

  async activate(id: string, actorUserId: string | null, ip: string | null): Promise<User> {
    const user = await this.users.setStatus(id, UserStatus.ACTIVE);
    await this.audit.record({
      companyId: user.companyId,
      actorUserId,
      eventType: AuditEventType.USER_UPDATED,
      entityType: 'User',
      entityId: id,
      after: { status: UserStatus.ACTIVE },
      ipAddress: ip,
    });
    return user;
  }

  createDepartment(companyId: string, name: string, managerId?: string): Promise<Department> {
    return this.departments.create(companyId, name, managerId);
  }

  listDepartments(): Promise<Department[]> {
    return this.departments.list();
  }

  getDepartmentById(id: string): Promise<Department | null> {
    return this.departments.getById(id);
  }

  createTeam(companyId: string, departmentId: string, name: string): Promise<Team> {
    return this.teams.create(companyId, departmentId, name);
  }

  listTeams(): Promise<Team[]> {
    return this.teams.list();
  }

  getTeamById(id: string): Promise<Team | null> {
    return this.teams.getById(id);
  }
}
