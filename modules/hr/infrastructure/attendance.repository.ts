import type { TenantScopedPrismaClient, Shift, AttendanceRecord } from '@platform/database';

export interface CreateShiftInput {
  companyId: string;
  name: string;
  startTime: string;
  endTime: string;
}

export class ShiftRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateShiftInput): Promise<Shift> {
    return this.db.shift.create({ data: input });
  }

  list(companyId: string): Promise<Shift[]> {
    return this.db.shift.findMany({ where: { companyId } });
  }

  findById(id: string): Promise<Shift | null> {
    return this.db.shift.findUnique({ where: { id } });
  }
}

export class AttendanceRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  clockIn(
    companyId: string,
    employeeId: string,
    date: Date,
    clockInAt: Date,
  ): Promise<AttendanceRecord> {
    return this.db.attendanceRecord.create({ data: { companyId, employeeId, date, clockInAt } });
  }

  clockOut(id: string, clockOutAt: Date): Promise<AttendanceRecord> {
    return this.db.attendanceRecord.update({ where: { id }, data: { clockOutAt } });
  }

  findById(id: string): Promise<AttendanceRecord | null> {
    return this.db.attendanceRecord.findUnique({ where: { id } });
  }

  findOpenForEmployee(employeeId: string): Promise<AttendanceRecord | null> {
    return this.db.attendanceRecord.findFirst({
      where: { employeeId, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    });
  }

  list(companyId: string, employeeId?: string): Promise<AttendanceRecord[]> {
    return this.db.attendanceRecord.findMany({
      where: { companyId, employeeId },
      orderBy: { date: 'desc' },
    });
  }
}
