export interface LeaveDaySpan {
  startDate: Date;
  endDate: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Inclusive day count — a request from Monday to Monday is 1 day off, not 0. */
export function computeDaySpan(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
}

/**
 * A real computed report, never a stored/mutable counter that can drift — same philosophy
 * `AnalyticsKpiService` already established for KPI reads. `daysPerYear` minus the summed
 * inclusive day-span of every already-approved request for that policy this year.
 */
export function computeLeaveBalance(daysPerYear: number, approvedRequests: LeaveDaySpan[]): number {
  const usedDays = approvedRequests.reduce(
    (sum, r) => sum + computeDaySpan(r.startDate, r.endDate),
    0,
  );
  return daysPerYear - usedDays;
}
