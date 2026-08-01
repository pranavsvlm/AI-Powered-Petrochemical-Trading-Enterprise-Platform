import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type { TenantScopedPrismaClient, AttendanceRecord, Shift } from '@platform/database';
import {
  computeOvertimeHours,
  computeWorkedHours,
  parseShiftHours,
} from '../domain/attendance-hours';
import {
  AttendanceRepository,
  ShiftRepository,
  type CreateShiftInput,
} from '../infrastructure/attendance.repository';
import type { HrAuditWriter } from './ports';

export interface ClockOutResult {
  record: AttendanceRecord;
  workedHours: number;
  overtimeHours: number;
}

/**
 * Real clock-in/clock-out (doc 15's Attendance section) — mirrors `TimeEntryService`'s
 * start/stop shape from Phase 7a exactly, including the "only one open record at a time per
 * employee" guard. Overtime is computed on demand against a Shift's real parsed hours, never
 * stored as a separate mutable field.
 */
@Injectable()
export class AttendanceService {
  private readonly attendance: AttendanceRepository;
  private readonly shifts: ShiftRepository;

  constructor(
    db: TenantScopedPrismaClient,
    private readonly audit: HrAuditWriter,
  ) {
    this.attendance = new AttendanceRepository(db);
    this.shifts = new ShiftRepository(db);
  }

  async clockIn(companyId: string, employeeId: string): Promise<AttendanceRecord> {
    const open = await this.attendance.findOpenForEmployee(employeeId);
    if (open) {
      throw new BadRequestException(
        `Already clocked in (attendance record ${open.id}) — clock out before clocking in again.`,
      );
    }
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return this.attendance.clockIn(companyId, employeeId, date, now);
  }

  async clockOut(
    id: string,
    actorUserId: string,
    shiftHours?: number,
    ipAddress?: string | null,
  ): Promise<ClockOutResult> {
    const record = await this.attendance.findById(id);
    if (!record) throw new NotFoundException('Attendance record not found.');
    if (record.clockOutAt) throw new BadRequestException('Already clocked out.');

    const clockOutAt = new Date();
    const updated = await this.attendance.clockOut(id, clockOutAt);
    const workedHours = computeWorkedHours(record.clockInAt, clockOutAt);
    const overtimeHours = shiftHours ? computeOvertimeHours(workedHours, shiftHours) : 0;

    await this.audit.record({
      companyId: record.companyId,
      actorUserId,
      eventType: AuditEventType.ATTENDANCE_RECORDED,
      entityType: 'AttendanceRecord',
      entityId: id,
      after: { workedHours, overtimeHours },
      ipAddress: ipAddress ?? null,
    });

    return { record: updated, workedHours, overtimeHours };
  }

  list(companyId: string, employeeId?: string): Promise<AttendanceRecord[]> {
    return this.attendance.list(companyId, employeeId);
  }

  createShift(input: CreateShiftInput): Promise<Shift> {
    // Validated for real at read time, not just accepted — a malformed "HH:MM" throws here.
    parseShiftHours(input.startTime, input.endTime);
    return this.shifts.create(input);
  }

  listShifts(companyId: string): Promise<Shift[]> {
    return this.shifts.list(companyId);
  }

  async getShiftHours(shiftId: string): Promise<number> {
    const shift = await this.shifts.findById(shiftId);
    if (!shift) throw new NotFoundException('Shift not found.');
    return parseShiftHours(shift.startTime, shift.endTime);
  }
}
