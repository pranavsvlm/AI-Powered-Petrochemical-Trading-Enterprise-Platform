export class InvalidAttendanceRangeError extends Error {
  constructor() {
    super('Clock-out time must be after clock-in time.');
    this.name = 'InvalidAttendanceRangeError';
  }
}

export function computeWorkedHours(clockInAt: Date, clockOutAt: Date): number {
  const ms = clockOutAt.getTime() - clockInAt.getTime();
  if (ms < 0) throw new InvalidAttendanceRangeError();
  return ms / (1000 * 60 * 60);
}

export function computeOvertimeHours(workedHours: number, shiftHours: number): number {
  return Math.max(0, workedHours - shiftHours);
}

/** Parses "HH:MM" shift boundaries into a duration in hours; handles an overnight shift (end < start). */
export function parseShiftHours(startTime: string, endTime: string): number {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours! * 60 + minutes!;
  };
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  const diffMinutes =
    endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
  return diffMinutes / 60;
}
